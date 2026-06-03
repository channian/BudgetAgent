from functools import wraps
from flask import Blueprint, request, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash
from db import cursor as db_cursor, row_to_dict

auth_bp = Blueprint("auth", __name__)

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


@auth_bp.post("/login")
def login():
    data       = request.json or {}
    ad_account = (data.get("username") or "").strip()
    password   = (data.get("password") or "").strip()

    if not ad_account or not password:
        return jsonify(error="請輸入帳號與密碼"), 400

    # ── Step 1: try Windows AD authentication ────────────────────────
    try:
        from utils.ldap_auth import ad_authenticate
        ad_info = ad_authenticate(ad_account, password)
    except Exception:
        ad_info = None

    # ── Step 2: look up (or auto-sync) the user in the local DB ──────
    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.users WHERE ad_account = %s",
                (ad_account,),
            )
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=f"資料庫連線失敗：{e}"), 500

    if ad_info:
        # AD auth succeeded → sync name/department/email from AD into the DB
        if row:
            user = row_to_dict(row)
            try:
                with db_cursor(commit=True) as cur:
                    cur.execute(
                        """UPDATE budget.users
                           SET name       = COALESCE(%s, name),
                               department = COALESCE(%s, department),
                               email      = COALESCE(%s, email)
                           WHERE ad_account = %s""",
                        (ad_info.get("name"), ad_info.get("department"),
                         ad_info.get("email"), ad_account),
                    )
                # Refresh after sync
                with db_cursor() as cur:
                    cur.execute("SELECT * FROM budget.users WHERE ad_account = %s", (ad_account,))
                    user = row_to_dict(cur.fetchone())
            except Exception:
                pass  # sync failure is non-fatal; proceed with cached record
        else:
            # AD user exists but has no local record → auto-provision as viewer
            try:
                with db_cursor(commit=True) as cur:
                    cur.execute(
                        """INSERT INTO budget.users (name, department, ad_account, role, email)
                           VALUES (%s, %s, %s, 'viewer', %s)
                           RETURNING *""",
                        (ad_info.get("name") or ad_account,
                         ad_info.get("department"),
                         ad_account,
                         ad_info.get("email")),
                    )
                    user = row_to_dict(cur.fetchone())
            except Exception as e:
                return jsonify(error=f"帳號自動建立失敗：{e}"), 500

        session["user"] = user
        return jsonify(user=_safe(user), auth_method="ad")

    # ── Step 3: AD not configured / unreachable → fall back to local DB password ──
    if not row:
        return jsonify(error="帳號不存在，請聯繫系統管理員"), 401

    user        = row_to_dict(row)
    stored_hash = user.get("password") or ""

    if not stored_hash:
        return jsonify(error="此帳號尚未設定密碼，請聯繫系統管理員"), 401

    if not check_password_hash(stored_hash, password):
        return jsonify(error="密碼錯誤"), 401

    session["user"] = user
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

