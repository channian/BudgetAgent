import os, uuid, datetime, decimal
from flask import Blueprint, request, jsonify, send_file
from db import cursor as db_cursor
from routes.auth import require_auth, current_user

attachments_bp = Blueprint("attachments", __name__)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


def init_attachments_schema():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    try:
        with db_cursor(commit=True) as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS budget.attachments (
                    id            SERIAL PRIMARY KEY,
                    budget_id     INT NOT NULL
                                  REFERENCES budget.budget_requests(id) ON DELETE CASCADE,
                    filename      VARCHAR NOT NULL,
                    original_name VARCHAR NOT NULL,
                    file_size     INT,
                    uploaded_by   VARCHAR,
                    uploaded_at   TIMESTAMP DEFAULT NOW()
                )
            """)
    except Exception:
        pass


def _att_to_dict(row):
    d = {}
    for k, v in dict(row).items():
        if isinstance(v, (datetime.datetime, datetime.date)):
            v = v.isoformat()
        elif isinstance(v, decimal.Decimal):
            v = float(v)
        d[k] = v
    return d


@attachments_bp.post("/budgets/<int:budget_id>/attachments")
@require_auth
def upload_attachment(budget_id):
    user = current_user()
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(error="未收到檔案"), 400

    original_name = f.filename
    ext = os.path.splitext(original_name)[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"

    save_dir = os.path.join(UPLOAD_DIR, str(budget_id))
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, stored_name)
    f.save(save_path)
    file_size = os.path.getsize(save_path)

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """INSERT INTO budget.attachments
                       (budget_id, filename, original_name, file_size, uploaded_by)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING *""",
                (budget_id, stored_name, original_name, file_size, user.get("name")),
            )
            row = _att_to_dict(cur.fetchone())
    except Exception as e:
        try:
            os.remove(save_path)
        except Exception:
            pass
        return jsonify(error=str(e)), 500

    return jsonify(attachment=row)


@attachments_bp.get("/budgets/<int:budget_id>/attachments")
@require_auth
def list_attachments(budget_id):
    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.attachments WHERE budget_id = %s ORDER BY uploaded_at",
                (budget_id,),
            )
            rows = [_att_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(attachments=rows)


@attachments_bp.get("/attachments/<int:att_id>/download")
@require_auth
def download_attachment(att_id):
    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.attachments WHERE id = %s", (att_id,))
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=str(e)), 500
    if not row:
        return jsonify(error="找不到附件"), 404
    r = _att_to_dict(row)
    path = os.path.join(UPLOAD_DIR, str(r["budget_id"]), r["filename"])
    if not os.path.exists(path):
        return jsonify(error="檔案不存在"), 404
    return send_file(path, download_name=r["original_name"], as_attachment=True)


@attachments_bp.delete("/attachments/<int:att_id>")
@require_auth
def delete_attachment(att_id):
    user = current_user()
    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.attachments WHERE id = %s", (att_id,))
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=str(e)), 500
    if not row:
        return jsonify(error="找不到附件"), 404
    r = _att_to_dict(row)

    if user.get("role") != "admin" and user.get("name") != r.get("uploaded_by"):
        return jsonify(error="無刪除權限"), 403

    try:
        with db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM budget.attachments WHERE id = %s", (att_id,))
    except Exception as e:
        return jsonify(error=str(e)), 500

    path = os.path.join(UPLOAD_DIR, str(r["budget_id"]), r["filename"])
    try:
        os.remove(path)
    except Exception:
        pass

    return jsonify(ok=True)
