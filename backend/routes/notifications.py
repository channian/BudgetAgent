from flask import Blueprint, jsonify
from db import cursor as db_cursor, row_to_dict
from routes.auth import require_auth, current_user

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("/notifications")
@require_auth
def list_notifications():
    user = current_user()
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT * FROM budget.notifications
                   WHERE user_id = %s
                   ORDER BY created_at DESC
                   LIMIT 50""",
                (user["id"],),
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(notifications=rows)


@notifications_bp.put("/notifications/<int:notif_id>/read")
@require_auth
def mark_read(notif_id):
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                "UPDATE budget.notifications SET read_at = NOW() WHERE notification_id = %s",
                (notif_id,),
            )
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(ok=True)
