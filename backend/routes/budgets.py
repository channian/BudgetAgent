import io, csv, datetime
from flask import Blueprint, request, jsonify, send_file
from psycopg2.extras import Json as PgJson
from db import cursor as db_cursor, row_to_dict
from utils.audit import log as audit_log
from routes.auth import require_auth, current_user

budgets_bp = Blueprint("budgets", __name__)

PENDING_STATUSES   = ["AI_REVIEW", "EXPERT_REVIEW", "PENDING_ACTION"]
COMPLETED_STATUSES = ["CLOSED", "REJECTED"]


def _notify_roles(roles, message):
    """Insert a notification row for every user whose role is in `roles`."""
    try:
        with db_cursor() as cur:
            cur.execute("SELECT id FROM budget.users WHERE role = ANY(%s)", (roles,))
            user_ids = [r["id"] for r in cur.fetchall()]
        if not user_ids:
            return
        with db_cursor(commit=True) as cur:
            for uid in user_ids:
                cur.execute(
                    "INSERT INTO budget.notifications (user_id, text) VALUES (%s, %s)",
                    (uid, message),
                )
    except Exception:
        pass


# ── List ──────────────────────────────────────────────────────────────
@budgets_bp.get("/budgets")
@require_auth
def list_budgets():
    scope    = request.args.get("scope", "pending")
    q        = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()

    statuses   = PENDING_STATUSES if scope == "pending" else COMPLETED_STATUSES
    conditions = ["status = ANY(%s)"]
    params     = [statuses]

    if q:
        conditions.append("(project_name ILIKE %s OR budget_no ILIKE %s)")
        like = f"%{q}%"
        params += [like, like]
    if category:
        conditions.append("category = %s")
        params.append(category)

    where = " AND ".join(conditions)
    try:
        with db_cursor() as cur:
            cur.execute(
                f"SELECT * FROM budget.budget_requests WHERE {where} ORDER BY created_at DESC",
                params,
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500

    return jsonify(budgets=rows)


# ── Create ────────────────────────────────────────────────────────────
@budgets_bp.post("/budgets")
@require_auth
def create_budget():
    data = request.json or {}
    user = current_user()

    _, iso_week, _ = datetime.datetime.now().isocalendar()

    ai_obj = data.get("ai_result_obj")
    owner  = (data.get("owner") or user.get("name") or "").strip() or None
    status = "EXPERT_REVIEW" if ai_obj else "AI_REVIEW"

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """INSERT INTO budget.budget_requests
                       (project_name, week, category, sub_category, expert_name,
                        owner, amount, ai_comment, ai_result, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (project_name) DO UPDATE SET
                       category      = EXCLUDED.category,
                       owner         = EXCLUDED.owner,
                       amount        = EXCLUDED.amount,
                       sub_category  = COALESCE(EXCLUDED.sub_category,  budget_requests.sub_category),
                       expert_name   = COALESCE(EXCLUDED.expert_name,   budget_requests.expert_name),
                       ai_comment    = COALESCE(EXCLUDED.ai_comment,    budget_requests.ai_comment),
                       ai_result     = COALESCE(EXCLUDED.ai_result,     budget_requests.ai_result)
                   RETURNING id""",
                (
                    data.get("project_name"),
                    iso_week,
                    data.get("category"),
                    data.get("sub_category"),
                    data.get("expert_name"),
                    owner,
                    data.get("amount", 0),
                    data.get("ai_comment"),
                    PgJson(ai_obj) if ai_obj else None,
                    status,
                ),
            )
            budget_id = cur.fetchone()["id"]
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(budget_id, "CREATE", user.get("name", "system"), None, data)
    return jsonify(id=budget_id, status=status), 201


# ── Get single ────────────────────────────────────────────────────────
@budgets_bp.get("/budgets/<int:budget_id>")
@require_auth
def get_budget(budget_id):
    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.budget_requests WHERE id = %s",
                (budget_id,),
            )
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=str(e)), 500

    if not row:
        return jsonify(error="案件不存在"), 404
    return jsonify(budget=row_to_dict(row))


# ── Update (general fields) ───────────────────────────────────────────
@budgets_bp.put("/budgets/<int:budget_id>")
@require_auth
def update_budget(budget_id):
    data = request.json or {}
    user = current_user()

    allowed = {"expert_name", "owner", "amount", "category", "sub_category", "note", "expert_comment"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify(error="無可更新欄位"), 400

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE id = %s", (budget_id,))
            before_row = cur.fetchone()
        if not before_row:
            return jsonify(error="案件不存在"), 404
        before = row_to_dict(before_row)

        set_clause = ", ".join(f"{k} = %s" for k in updates)
        with db_cursor(commit=True) as cur:
            cur.execute(
                f"UPDATE budget.budget_requests SET {set_clause} WHERE id = %s RETURNING *",
                [*updates.values(), budget_id],
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(budget_id, "UPDATE", user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Approve (CLOSED) ──────────────────────────────────────────────────
@budgets_bp.post("/budgets/<int:budget_id>/approve")
@require_auth
def approve_budget(budget_id):
    data    = request.json or {}
    user    = current_user()
    comment = data.get("comment", "")

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE id = %s", (budget_id,))
            before_row = cur.fetchone()
        if not before_row:
            return jsonify(error="案件不存在"), 404
        before = row_to_dict(before_row)
        if before["status"] != "EXPERT_REVIEW":
            return jsonify(error=f"目前狀態 {before['status']} 無法執行核可"), 400

        with db_cursor(commit=True) as cur:
            cur.execute(
                """UPDATE budget.budget_requests
                   SET expert_decision = '通過',
                       expert_comment  = %s,
                       sign_date       = NOW(),
                       cycle_time      = CASE
                           WHEN dispatch_date IS NOT NULL
                           THEN EXTRACT(DAY FROM (NOW() - dispatch_date))::INT
                           ELSE NULL
                       END,
                       status          = 'CLOSED'
                   WHERE id = %s
                   RETURNING *""",
                (comment, budget_id),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(budget_id, "APPROVE", user.get("name", "system"), before, after)
    _notify_roles(["admin", "viewer"],
        f"✅ 案件「{before['project_name']}」(#{budget_id}) 已核准通過，由 {user.get('name','系統')} 簽核。")
    return jsonify(budget=after)


# ── Reject ────────────────────────────────────────────────────────────
@budgets_bp.post("/budgets/<int:budget_id>/reject")
@require_auth
def reject_budget(budget_id):
    data       = request.json or {}
    user       = current_user()
    comment    = data.get("comment", "")
    final      = bool(data.get("final", False))
    new_status = "REJECTED" if final else "PENDING_ACTION"

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE id = %s", (budget_id,))
            before_row = cur.fetchone()
        if not before_row:
            return jsonify(error="案件不存在"), 404
        before = row_to_dict(before_row)

        with db_cursor(commit=True) as cur:
            cur.execute(
                """UPDATE budget.budget_requests
                   SET expert_decision = '退件',
                       expert_comment  = %s,
                       sign_date       = CASE WHEN %s THEN NOW() ELSE sign_date END,
                       status          = %s
                   WHERE id = %s
                   RETURNING *""",
                (comment, final, new_status, budget_id),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    action = "REJECT_FINAL" if final else "RETURN_FOR_SUPPLEMENT"
    audit_log(budget_id, action, user.get("name", "system"), before, after)
    if final:
        _notify_roles(["admin", "viewer"],
            f"❌ 案件「{before['project_name']}」(#{budget_id}) 已退件，由 {user.get('name','系統')} 審核。")
    else:
        _notify_roles(["admin", "viewer"],
            f"⚠ 案件「{before['project_name']}」(#{budget_id}) 退回補件，等待申請人補充資料。")
    return jsonify(budget=after)


# ── Resubmit ──────────────────────────────────────────────────────────
@budgets_bp.post("/budgets/<int:budget_id>/resubmit")
@require_auth
def resubmit_budget(budget_id):
    user = current_user()

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE id = %s", (budget_id,))
            before_row = cur.fetchone()
        if not before_row:
            return jsonify(error="案件不存在"), 404
        before = row_to_dict(before_row)
        if before["status"] != "PENDING_ACTION":
            return jsonify(error="只有待補件案件可重新遞交"), 400

        with db_cursor(commit=True) as cur:
            cur.execute(
                """UPDATE budget.budget_requests
                   SET status          = 'EXPERT_REVIEW',
                       expert_decision = NULL,
                       expert_comment  = NULL
                   WHERE id = %s
                   RETURNING *""",
                (budget_id,),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(budget_id, "RESUBMIT", user.get("name", "system"), before, after)
    _notify_roles(["admin", "viewer"],
        f"🔄 案件「{before['project_name']}」(#{budget_id}) 已重新遞交，進入專家審核。")
    return jsonify(budget=after)


# ── Export (CSV / XLSX) ───────────────────────────────────────────────
EXPORT_COLUMNS = [
    ("budget_no",       "預算單號"),
    ("week",            "週數"),
    ("project_name",    "項目名稱"),
    ("category",        "類別"),
    ("sub_category",    "判定類別"),
    ("owner",           "預算負責人"),
    ("expert_name",     "負責專家"),
    ("amount",          "金額"),
    ("ai_comment",      "AI 初審評論"),
    ("expert_comment",  "專家複審評論"),
    ("status",          "狀態"),
    ("dispatch_date",   "派送日期"),
    ("sign_date",       "簽核日期"),
    ("cycle_time",      "Cycle Time"),
    ("note",            "備註"),
]


def _fetch_for_export(scope):
    statuses = PENDING_STATUSES if scope == "pending" else COMPLETED_STATUSES
    with db_cursor() as cur:
        cur.execute(
            "SELECT * FROM budget.budget_requests WHERE status = ANY(%s) ORDER BY created_at DESC",
            (statuses,),
        )
        return [row_to_dict(r) for r in cur.fetchall()]


@budgets_bp.get("/budgets/export")
@require_auth
def export_budgets():
    scope = request.args.get("scope", "pending")
    fmt   = request.args.get("format", "csv").lower()
    try:
        rows = _fetch_for_export(scope)
    except Exception as e:
        return jsonify(error=str(e)), 500

    keys    = [k for k, _ in EXPORT_COLUMNS]
    headers = [h for _, h in EXPORT_COLUMNS]
    stamp   = datetime.datetime.now().strftime("%Y%m%d_%H%M")

    if fmt == "xlsx":
        try:
            from openpyxl import Workbook
        except ImportError:
            return jsonify(error="伺服器未安裝 openpyxl，請執行 pip install openpyxl"), 500
        wb = Workbook()
        ws = wb.active
        ws.title = "預算案件"
        ws.append(headers)
        for r in rows:
            ws.append([r.get(k, "") for k in keys])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=f"budget_{scope}_{stamp}.xlsx",
        )

    # CSV (UTF-8 BOM — Excel 開啟中文不亂碼)
    buf = io.StringIO()
    buf.write("﻿")
    writer = csv.writer(buf)
    writer.writerow(headers)
    for r in rows:
        writer.writerow([r.get(k, "") for k in keys])
    data = buf.getvalue().encode("utf-8")
    return send_file(
        io.BytesIO(data),
        mimetype="text/csv; charset=utf-8",
        as_attachment=True,
        download_name=f"budget_{scope}_{stamp}.csv",
    )


# ── Import (CSV / XLSX) ───────────────────────────────────────────────
IMPORT_ALIASES = {
    "project_name": ["項目名稱", "project_name", "project", "案件名稱"],
    "category":     ["類別", "category", "判定類別"],
    "owner":        ["預算負責人", "owner", "負責人"],
    "amount":       ["金額", "amount", "金額 (NT$)"],
}


def _resolve_header(header):
    norm = {str(h).strip(): i for i, h in enumerate(header)}
    idx = {}
    for field, aliases in IMPORT_ALIASES.items():
        for a in aliases:
            if a in norm:
                idx[field] = norm[a]
                break
    return idx


def _parse_amount(v):
    if v is None:
        return 0
    try:
        return float(str(v).replace(",", "").replace("NT$", "").strip())
    except ValueError:
        return 0


@budgets_bp.post("/budgets/import")
@require_auth
def import_budgets():
    user = current_user()
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(error="未收到檔案"), 400

    name = f.filename.lower()
    raw_rows = []
    try:
        if name.endswith(".xlsx"):
            from openpyxl import load_workbook
            wb   = load_workbook(f, read_only=True, data_only=True)
            data = list(wb.active.iter_rows(values_only=True))
            if not data:
                return jsonify(error="檔案是空的"), 400
            idx      = _resolve_header(data[0])
            raw_rows = data[1:]
        elif name.endswith(".csv"):
            reader   = list(csv.reader(io.StringIO(f.read().decode("utf-8-sig"))))
            if not reader:
                return jsonify(error="檔案是空的"), 400
            idx      = _resolve_header(reader[0])
            raw_rows = reader[1:]
        else:
            return jsonify(error="僅支援 .csv 或 .xlsx 檔案"), 400
    except Exception as e:
        return jsonify(error=f"檔案解析失敗：{e}"), 500

    if "project_name" not in idx:
        return jsonify(error="找不到「項目名稱」欄位，請確認標題列"), 400

    _, iso_week, _ = datetime.datetime.now().isocalendar()
    inserted, skipped, errors = 0, 0, []

    def cell(row, field):
        i = idx.get(field)
        if i is None or i >= len(row):
            return None
        v = row[i]
        return None if v is None or str(v).strip() == "" else str(v).strip()

    try:
        with db_cursor(commit=True) as cur:
            for n, row in enumerate(raw_rows, start=2):
                project = cell(row, "project_name")
                if not project:
                    skipped += 1
                    continue
                try:
                    cur.execute(
                        """INSERT INTO budget.budget_requests
                               (project_name, week, category, owner, amount, status)
                           VALUES (%s, %s, %s, %s, %s, 'AI_REVIEW')
                           ON CONFLICT (project_name) DO UPDATE SET
                               category = EXCLUDED.category,
                               owner    = EXCLUDED.owner,
                               amount   = EXCLUDED.amount
                           RETURNING id""",
                        (
                            project,
                            iso_week,
                            cell(row, "category"),
                            cell(row, "owner"),
                            _parse_amount(cell(row, "amount")),
                        ),
                    )
                    inserted += 1
                except Exception as re:
                    errors.append(f"第 {n} 列：{re}")
    except Exception as e:
        return jsonify(error=str(e)), 500

    try:
        audit_log(None, "IMPORT", user.get("name", "system"), None,
                  {"inserted": inserted, "skipped": skipped})
    except Exception:
        pass

    return jsonify(inserted=inserted, skipped=skipped, errors=errors[:20])


# ── Timeline ──────────────────────────────────────────────────────────
@budgets_bp.get("/budgets/<int:budget_id>/timeline")
@require_auth
def get_timeline(budget_id):
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT id, action, operator, timestamp, diff_before, diff_after
                   FROM budget.audit_logs
                   WHERE request_id = %s
                   ORDER BY timestamp ASC""",
                (budget_id,),
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(timeline=rows)
