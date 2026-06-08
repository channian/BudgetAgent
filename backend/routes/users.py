from flask import Blueprint, request, jsonify
from db import cursor as db_cursor, row_to_dict
from routes.auth import require_auth, current_user

users_bp = Blueprint("users", __name__)

ROLES = ("admin", "expert", "viewer")


# ── List all users ────────────────────────────────────────────────────
@users_bp.get("/users")
@require_auth
def list_users():
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT id, name, department, ad_account, role, email, created_at
                   FROM budget.users
                   ORDER BY name""",
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(users=rows)


# ── Create user (admin only) ──────────────────────────────────────────
@users_bp.post("/users")
@require_auth
def create_user():
    caller = current_user()
    if caller.get("role") != "admin":
        return jsonify(error="僅系統管理員可新增使用者"), 403

    data = request.json or {}
    name       = (data.get("name")       or "").strip()
    ad_account = (data.get("ad_account") or "").strip()
    role       = (data.get("role")       or "viewer").strip()
    department = (data.get("department") or "").strip() or None
    email      = (data.get("email")      or "").strip() or None
    if not name or not ad_account:
        return jsonify(error="姓名與 AD 帳號為必填"), 400
    if role not in ROLES:
        return jsonify(error=f"角色必須是 {'/'.join(ROLES)} 其中之一"), 400

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """INSERT INTO budget.users (name, department, ad_account, password, role, email)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (name, department, ad_account, "", role, email),
            )
            new_id = cur.fetchone()["id"]
    except Exception as e:
        if "unique" in str(e).lower():
            return jsonify(error=f"AD 帳號「{ad_account}」已存在"), 409
        return jsonify(error=str(e)), 500

    return jsonify(id=new_id), 201


# ── Update user role / info (admin only) ──────────────────────────────
@users_bp.put("/users/<int:user_id>")
@require_auth
def update_user(user_id):
    caller = current_user()
    if caller.get("role") != "admin":
        return jsonify(error="僅系統管理員可修改使用者"), 403

    data = request.json or {}
    allowed = {"name", "department", "role", "email"}
    updates = {k: v for k, v in data.items() if k in allowed and v is not None}

    if "role" in updates and updates["role"] not in ROLES:
        return jsonify(error=f"角色必須是 {'/'.join(ROLES)} 其中之一"), 400
    if not updates:
        return jsonify(error="無可更新欄位"), 400

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                f"UPDATE budget.users SET {set_clause} WHERE id = %s RETURNING id, name, department, ad_account, role, email",
                [*updates.values(), user_id],
            )
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=str(e)), 500

    if not row:
        return jsonify(error="使用者不存在"), 404
    return jsonify(user=row_to_dict(row))


# ── Delete user (admin only) ──────────────────────────────────────────
@users_bp.delete("/users/<int:user_id>")
@require_auth
def delete_user(user_id):
    caller = current_user()
    if caller.get("role") != "admin":
        return jsonify(error="僅系統管理員可刪除使用者"), 403
    if caller.get("id") == user_id:
        return jsonify(error="無法刪除自己的帳號"), 400

    try:
        with db_cursor() as cur:
            cur.execute("SELECT role FROM budget.users WHERE id = %s", (user_id,))
            row = cur.fetchone()
        if not row:
            return jsonify(error="使用者不存在"), 404
        if row_to_dict(row)["role"] == "admin":
            with db_cursor() as cur:
                cur.execute("SELECT COUNT(*) AS n FROM budget.users WHERE role = 'admin'")
                if cur.fetchone()["n"] <= 1:
                    return jsonify(error="無法刪除最後一位系統管理員"), 400
        with db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM budget.users WHERE id = %s", (user_id,))
    except Exception as e:
        return jsonify(error=str(e)), 500

    return jsonify(ok=True)

