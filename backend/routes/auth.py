from functools import wraps
import logging
from flask import Blueprint, request, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash
from db import cursor as db_cursor, row_to_dict

logger = logging.getLogger(__name__)
auth_bp = Blueprint("auth", __name__)


def _ensure_login_logs(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budget.login_logs (
            id          SERIAL PRIMARY KEY,
            user_id     INT REFERENCES budget.users(id) ON DELETE SET NULL,
            ad_account  VARCHAR,
            name        VARCHAR,
            auth_method VARCHAR,
            login_at    TIMESTAMP DEFAULT NOW()
        )
    """)


def _log_login(user, auth_method):
    try:
        with db_cursor(commit=True) as cur:
            _ensure_login_logs(cur)
            cur.execute(
                """INSERT INTO budget.login_logs (user_id, ad_account, name, auth_method)
                   VALUES (%s, %s, %s, %s)""",
                (user.get("id"), user.get("ad_account"), user.get("name"), auth_method),
            )
    except Exception:
        pass  # login tracking is non-fatal

_SAFE_FIELDS = ("id", "name", "department", "ad_account", "role", "email")


def _safe(u):
    return {k: u.get(k) for k in _SAFE_FIELDS}


def current_user():
    return session.get("user")


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            return jsonify(error="請先登入"), 401
        return f(*args, **kwargs)
    return wrapper


def _sync_from_hr(empno: str) -> dict:
    """Fetch name / email from kh_ad_employees by empno. Returns {} on failure."""
    try:
        import psycopg2
        from config import HR_DB
        conn = psycopg2.connect(**HR_DB)
        cur  = conn.cursor()
        cur.execute(
            "SELECT empname, email FROM kh_ad_employees WHERE empno = %s LIMIT 1",
            (empno,),
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if row:
            return {"name": row[0] or empno, "email": row[1] or ""}
    except Exception:
        pass
    return {}


@auth_bp.post("/login")
def login():
    data   = request.json or {}
    empno  = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not empno or not password:
        return jsonify(error="請輸入員工編號與密碼"), 400

    # ── Step 1: whitelist check — account must be pre-created by admin ──
    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.users WHERE ad_account = %s",
                (empno,),
            )
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=f"資料庫連線失敗：{e}"), 500

    if not row:
        return jsonify(error="帳號尚未開通，請聯繫系統管理員"), 401

    user = row_to_dict(row)

    # ── Step 2: try Windows AD (NTLM) authentication ─────────────────
    ad_error = None
    try:
        from utils.ldap_auth import ad_authenticate
        ad_info = ad_authenticate(empno, password)
    except ImportError as e:
        ad_info = None
        ad_error = f"ldap3 套件未安裝：{e}"
        logger.warning("AD login skipped — ldap3 not installed: %s", e)
    except Exception as e:
        ad_info = None
        ad_error = str(e)
        logger.warning("AD login exception for %s: %s", empno, e)

    if ad_info:
        # AD succeeded → sync latest name / email from HR DB
        hr = _sync_from_hr(empno)
        if hr:
            try:
                with db_cursor(commit=True) as cur:
                    cur.execute(
                        """UPDATE budget.users
                           SET name  = COALESCE(%s, name),
                               email = COALESCE(NULLIF(%s,''), email)
                           WHERE ad_account = %s""",
                        (hr.get("name"), hr.get("email"), empno),
                    )
                with db_cursor() as cur:
                    cur.execute("SELECT * FROM budget.users WHERE ad_account = %s", (empno,))
                    user = row_to_dict(cur.fetchone())
            except Exception:
                pass  # sync failure is non-fatal

        session["user"] = user
        _log_login(user, "ad")
        return jsonify(user=_safe(user), auth_method="ad")

    # ── Step 3: AD not configured / unreachable → local hash fallback ─
    stored_hash = user.get("password") or ""
    if not stored_hash:
        # Include the real AD failure reason so user/admin can diagnose
        detail = f"（原因：{ad_error}）" if ad_error else "（AD 伺服器無法連線或拒絕）"
        logger.warning("Login blocked — AD failed and no local password for %s. %s", empno, detail)
        return jsonify(error=f"AD 驗證失敗，且此帳號尚未設定備用密碼。{detail}"), 401

    if not check_password_hash(stored_hash, password):
        return jsonify(error="密碼錯誤"), 401

    session["user"] = user
    _log_login(user, "local")
    return jsonify(user=_safe(user), auth_method="local")


@auth_bp.post("/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@auth_bp.get("/me")
def me():
    user = session.get("user")
    if not user:
        return jsonify(error="未登入"), 401
    return jsonify(user=_safe(user))


@auth_bp.put("/me/password")
@require_auth
def change_my_password():
    """Any logged-in user can replace their own password."""
    user     = current_user()
    data     = request.json or {}
    new_pass = (data.get("password") or "").strip()

    if not new_pass:
        return jsonify(error="密碼不得為空"), 400

    hashed = generate_password_hash(new_pass)
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                "UPDATE budget.users SET password = %s WHERE id = %s",
                (hashed, user["id"]),
            )
    except Exception as e:
        return jsonify(error=str(e)), 500

    return jsonify(ok=True)


@auth_bp.get("/lookup_employee")
@require_auth
def lookup_employee():
    """Admin-only: look up an employee's name & email from HR DB by empno."""
    if current_user().get("role") != "admin":
        return jsonify(error="權限不足"), 403

    empno = request.args.get("empno", "").strip()
    if not empno:
        return jsonify(error="請輸入員工編號"), 400

    hr = _sync_from_hr(empno)
    if hr:
        return jsonify(found=True, name=hr.get("name", ""), email=hr.get("email", ""))
    return jsonify(found=False)


@auth_bp.get("/stats/logins")
@require_auth
def login_stats():
    """Admin-only: user activity & login history."""
    u = current_user()
    if u.get("role") != "admin":
        return jsonify(error="權限不足"), 403

    try:
        with db_cursor(commit=True) as cur:
            _ensure_login_logs(cur)   # auto-provision on first access

        with db_cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM budget.users")
            total_users = cur.fetchone()["n"]

            cur.execute("""
                SELECT COUNT(DISTINCT user_id) AS n FROM budget.login_logs
                WHERE login_at >= NOW() - INTERVAL '7 days'
            """)
            active_7d = cur.fetchone()["n"]

            cur.execute("""
                SELECT COUNT(DISTINCT user_id) AS n FROM budget.login_logs
                WHERE login_at >= NOW() - INTERVAL '30 days'
            """)
            active_30d = cur.fetchone()["n"]

            cur.execute("""
                SELECT COUNT(*) AS n FROM budget.login_logs
                WHERE login_at::date = CURRENT_DATE
            """)
            logins_today = cur.fetchone()["n"]

            cur.execute("""
                SELECT
                    u.id, u.name, u.ad_account, u.department, u.role,
                    MAX(l.login_at) AS last_login,
                    COUNT(l.id) FILTER (WHERE l.login_at >= NOW() - INTERVAL '7 days')  AS logins_7d,
                    COUNT(l.id) FILTER (WHERE l.login_at >= NOW() - INTERVAL '30 days') AS logins_30d
                FROM budget.users u
                LEFT JOIN budget.login_logs l ON l.user_id = u.id
                GROUP BY u.id, u.name, u.ad_account, u.department, u.role
                ORDER BY last_login DESC NULLS LAST, u.name
            """)
            users = [row_to_dict(r) for r in cur.fetchall()]

            cur.execute("""
                SELECT login_at::date AS day, COUNT(*) AS cnt
                FROM budget.login_logs
                WHERE login_at >= NOW() - INTERVAL '30 days'
                GROUP BY day ORDER BY day
            """)
            daily = [{"date": row_to_dict(r)["day"], "count": row_to_dict(r)["cnt"]}
                     for r in cur.fetchall()]

    except Exception as e:
        return jsonify(error=str(e)), 500

    return jsonify(
        summary={
            "total_users":  total_users,
            "active_7d":    active_7d,
            "active_30d":   active_30d,
            "logins_today": logins_today,
        },
        users=users,
        daily=daily,
    )


@auth_bp.get("/test-ad")
def test_ad():
    """
    AD 連線診斷端點（任何人可呼叫，不需登入）。
    用法：瀏覽器開 http://<server>:5000/api/test-ad
    回傳每個步驟是否成功，以及失敗的精確原因。
    """
    result = {}

    # Step 1: ldap3 installed?
    try:
        import ldap3
        result["ldap3_installed"] = True
        result["ldap3_version"] = ldap3.__version__
    except ImportError as e:
        result["ldap3_installed"] = False
        result["ldap3_error"] = str(e)
        return jsonify(result), 200

    # Step 2: config loaded?
    try:
        from config import LDAP_SERVER, LDAP_DOMAIN, LDAP_BASE_DN
        result["ldap_server"] = LDAP_SERVER
        result["ldap_domain"] = LDAP_DOMAIN
        result["ldap_base_dn"] = LDAP_BASE_DN
        result["ldap_server_set"] = bool(LDAP_SERVER)
    except Exception as e:
        result["config_error"] = str(e)
        return jsonify(result), 200

    if not LDAP_SERVER:
        result["verdict"] = "❌ LDAP_SERVER 未設定"
        return jsonify(result), 200

    # Step 3: TCP reachable on port 389?
    import socket
    try:
        sock = socket.create_connection((LDAP_SERVER, 389), timeout=3)
        sock.close()
        result["tcp_389_reachable"] = True
    except Exception as e:
        result["tcp_389_reachable"] = False
        result["tcp_error"] = str(e)
        result["verdict"] = f"❌ 無法連到 {LDAP_SERVER}:389 — 可能是防火牆或 server 未啟動"
        return jsonify(result), 200

    # Step 4: anonymous bind (just check server responds)
    try:
        from ldap3 import Server, Connection, NONE as LDAP_NONE
        srv = Server(LDAP_SERVER, get_info=LDAP_NONE)
        conn = Connection(srv)
        conn.open()
        result["ldap_open"] = True
        conn.unbind()
    except Exception as e:
        result["ldap_open"] = False
        result["ldap_open_error"] = str(e)
        result["verdict"] = f"❌ LDAP 連線建立失敗：{e}"
        return jsonify(result), 200

    result["verdict"] = "✅ AD 伺服器可達。若登入失敗請用 POST /api/auth/test-ad-login 測試 NTLM 認證。"
    return jsonify(result), 200


@auth_bp.post("/test-ad-login")
def test_ad_login():
    """
    NTLM 認證診斷（任何人可呼叫，不需登入）。
    用法：POST /api/auth/test-ad-login  body: {"username": "...", "password": "..."}
    直接用提供的帳密測試所有 bind 策略，回報每一種的精確結果。
    """
    data     = request.json or {}
    empno    = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not empno or not password:
        return jsonify(error="username and password required"), 400

    try:
        from ldap3 import (Server, Connection, Tls,
                           NTLM, SIMPLE, ENCRYPT, NONE as LDAP_NONE)
        from config import LDAP_SERVER, LDAP_DOMAIN, LDAP_BASE_DN
    except ImportError as e:
        return jsonify(error=f"ldap3 not installed: {e}"), 500

    import ssl
    fqdn     = ".".join(p.split("=")[1] for p in LDAP_BASE_DN.split(",") if p.upper().startswith("DC="))
    user_nt  = f"{LDAP_DOMAIN}\\{empno}"
    user_upn = f"{empno}@{fqdn}"
    tls      = Tls(validate=ssl.CERT_NONE)

    result = {"server": LDAP_SERVER, "domain": LDAP_DOMAIN, "fqdn": fqdn,
              "user_nt": user_nt, "user_upn": user_upn,
              "base_dn": LDAP_BASE_DN, "attempts": []}

    if not LDAP_SERVER:
        result["verdict"] = "❌ LDAP_SERVER 未設定"
        return jsonify(result), 200

    strategies = [
        ("SIMPLE UPN/LDAPS", dict(
            server=Server(LDAP_SERVER, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
            user=user_upn, authentication=SIMPLE)),
        ("NTLM sealed/389", dict(
            server=Server(LDAP_SERVER, port=389, get_info=LDAP_NONE),
            user=user_nt, authentication=NTLM, session_security=ENCRYPT)),
        ("NTLM plain/389", dict(
            server=Server(LDAP_SERVER, port=389, get_info=LDAP_NONE),
            user=user_nt, authentication=NTLM)),
        ("NTLM LDAPS/636", dict(
            server=Server(LDAP_SERVER, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
            user=user_nt, authentication=NTLM)),
    ]

    for label, kw in strategies:
        srv       = kw.pop("server")
        bind_user = kw.pop("user")
        attempt   = {"strategy": label, "bind_user": bind_user}
        try:
            conn = Connection(srv, user=bind_user, password=password, **kw)
            ok = conn.bind()
            attempt["bind_ok"] = ok
            attempt["result"]  = str(conn.result)
            result["attempts"].append(attempt)
            if ok:
                result["verdict"] = f"✅ bind 成功（策略：{label}）— AD 認證正常運作"
                conn.unbind()
                return jsonify(result), 200
        except Exception as e:
            attempt["exception"] = str(e)
            result["attempts"].append(attempt)

    result["verdict"] = "❌ 所有策略皆失敗。查看每個 attempt 的 result 判斷原因（data 52e=密碼錯, 775=帳號鎖定, 532=密碼過期, 533=帳號停用）。"
    return jsonify(result), 200
