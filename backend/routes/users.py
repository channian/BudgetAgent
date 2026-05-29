from flask import Blueprint, jsonify
from db import cursor as db_cursor, row_to_dict
from routes.auth import require_auth

users_bp = Blueprint("users", __name__)


@users_bp.get("/users")
@require_auth
def list_users():
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT id, name, department, ad_account, role
                   FROM budget.users
                   ORDER BY name""",
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(users=rows)
