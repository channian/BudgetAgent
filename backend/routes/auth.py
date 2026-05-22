from functools import wraps
from flask import Blueprint, request, jsonify, session
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
    data = request.json or {}
    ad_account = (data.get("username") or "").strip()
    password   = (data.get("password") or "").strip()

    if not ad_account or not password:
        return jsonify(error="請輸入帳號與密碼"), 400

    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.users WHERE ad_account = %s",
                (ad_account,),
            )
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=f"資料庫連線失敗：{e}"), 500

    if not row:
        return jsonify(error="帳號不存在，請聯繫系統管理員"), 401

    user = row_to_dict(row)
    session["user"] = user
    return jsonify(user=_safe(user))


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
