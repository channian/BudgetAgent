import io, csv, json, datetime
from flask import Blueprint, request, jsonify, send_file
from psycopg2.extras import Json as PgJson
from db import cursor as db_cursor, row_to_dict
from utils.audit import log as audit_log
from routes.auth import require_auth, current_user

budgets_bp = Blueprint("budgets", __name__)

PENDING_STATUSES   = ["AI_REVIEW", "EXPERT_REVIEW", "PENDING_ACTION"]
COMPLETED_STATUSES = ["CLOSED", "REJECTED"]


# ── List ──────────────────────────────────────────────────────────────
@budgets_bp.get("/budgets")
@require_auth
def list_budgets():
    scope    = request.args.get("scope", "pending")
    q        = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()

    statuses = PENDING_STATUSES if scope == "pending" else COMPLETED_STATUSES
    conditions = ["br.status::text = ANY(%s)"]
    params     = [statuses]

    if q:
        conditions.append(
            "(br.project_name ILIKE %s OR br.budget_no ILIKE %s)"
        )
        like = f"%{q}%"
        params += [like, like]
    if category:
        conditions.append("br.category = %s")
        params.append(category)

    where = " AND ".join(conditions)
    try:
        with db_cursor() as cur:
            cur.execute(
                f"""SELECT br.*
                    FROM budget.budget_requests br
                    WHERE {where}
                    ORDER BY br.jsondb_id DESC""",
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

    # AI fields are filled by the RPA pipeline; a manual create starts at AI_REVIEW.
    # If the RPA already produced a result before this UPSERT, keep it via COALESCE
    # so the human-entered fields never wipe out AI data mapped by project_name.
    status = "EXPERT_REVIEW" if ai_obj else "AI_REVIEW"

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """INSERT INTO budget.budget_requests
                       (project_name, week, category, sub_category, expert_name,
                        owner, amount, ai_comment, ai_result, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (project_name) DO UPDATE SET
                       category     = EXCLUDED.category,
                       owner        = EXCLUDED.owner,
                       amount       = EXCLUDED.amount,
                       sub_category = COALESCE(EXCLUDED.sub_category, budget.budget_requests.sub_category),
                       expert_name  = COALESCE(EXCLUDED.expert_name,  budget.budget_requests.expert_name),
                       ai_comment   = COALESCE(EXCLUDED.ai_comment,   budget.budget_requests.ai_comment),
                       ai_result    = COALESCE(EXCLUDED.ai_result,    budget.budget_requests.ai_result)
                   RETURNING jsondb_id""",
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
            jsondb_id = cur.fetchone()["jsondb_id"]
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(jsondb_id, "CREATE", user.get("name", "system"), None, data)
    return jsonify(jsondb_id=jsondb_id, status=status), 201


# ── Get single ────────────────────────────────────────────────────────
@budgets_bp.get("/budgets/<int:jsondb_id>")
@require_auth
def get_budget(jsondb_id):
    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.budget_requests WHERE jsondb_id = %s",
                (jsondb_id,),
            )
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=str(e)), 500

    if not row:
        return jsonify(error="案件不存在"), 404
    return jsonify(budget=row_to_dict(row))


# ── Update (general fields) ───────────────────────────────────────────
@budgets_bp.put("/budgets/<int:jsondb_id>")
@require_auth
def update_budget(jsondb_id):
    data = request.json or {}
    user = current_user()

    allowed = {"expert_name", "owner", "amount", "category", "sub_category", "note", "expert_comment"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify(error="無可更新欄位"), 400

    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.budget_requests WHERE jsondb_id = %s",
                (jsondb_id,),
            )
            before_row = cur.fetchone()
        if not before_row:
            return jsonify(error="案件不存在"), 404
        before = row_to_dict(before_row)

        set_clause = ", ".join(f"{k} = %s" for k in updates)
        vals       = list(updates.values())
        with db_cursor(commit=True) as cur:
            cur.execute(
                f"UPDATE budget.budget_requests SET {set_clause} WHERE jsondb_id = %s RETURNING *",
                [*vals, jsondb_id],
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(jsondb_id, "UPDATE", user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Approve (CLOSED) ──────────────────────────────────────────────────
@budgets_bp.post("/budgets/<int:jsondb_id>/approve")
@require_auth
def approve_budget(jsondb_id):
    data    = request.json or {}
    user    = current_user()
    comment = data.get("comment", "")

    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.budget_requests WHERE jsondb_id = %s",
                (jsondb_id,),
            )
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
                           THEN EXTRACT(DAY FROM (NOW() - dispatch_date))
                           ELSE NULL
                       END,
                       status          = 'CLOSED'
                   WHERE jsondb_id = %s
                   RETURNING *""",
                (comment, jsondb_id),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(jsondb_id, "APPROVE", user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Reject ────────────────────────────────────────────────────────────
@budgets_bp.post("/budgets/<int:jsondb_id>/reject")
@require_auth
def reject_budget(jsondb_id):
    data       = request.json or {}
    user       = current_user()
    comment    = data.get("comment", "")
    final      = bool(data.get("final", False))
    new_status = "REJECTED" if final else "PENDING_ACTION"

    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.budget_requests WHERE jsondb_id = %s",
                (jsondb_id,),
            )
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
                   WHERE jsondb_id = %s
                   RETURNING *""",
                (comment, final, new_status, jsondb_id),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    action = "REJECT_FINAL" if final else "RETURN_FOR_SUPPLEMENT"
    audit_log(jsondb_id, action, user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Resubmit ──────────────────────────────────────────────────────────
@budgets_bp.post("/budgets/<int:jsondb_id>/resubmit")
@require_auth
def resubmit_budget(jsondb_id):
    user = current_user()

    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT * FROM budget.budget_requests WHERE jsondb_id = %s",
                (jsondb_id,),
            )
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
                   WHERE jsondb_id = %s
                   RETURNING *""",
                (jsondb_id,),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(jsondb_id, "RESUBMIT", user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Export (CSV / XLSX) ───────────────────────────────────────────────
EXPORT_COLUMNS = [
    ("budget_no",    "預算單號"),
    ("week",         "週數"),
    ("project_name", "項目名稱"),
    ("category",     "類別"),
    ("sub_category", "判定類別"),
    ("owner",        "預算負責人"),
    ("expert_name",  "負責專家"),
    ("amount",       "金額"),
    ("ai_comment",   "AI 初審評論"),
    ("expert_comment", "專家複審評論"),
    ("status",       "狀態"),
    ("dispatch_date", "派送日期"),
    ("sign_date",    "簽核日期"),
    ("cycle_time",   "Cycle Time"),
    ("note",         "備註"),
]


def _fetch_for_export(scope):
    statuses = PENDING_STATUSES if scope == "pending" else COMPLETED_STATUSES
    with db_cursor() as cur:
        cur.execute(
            "SELECT * FROM budget.budget_requests WHERE status::text = ANY(%s) ORDER BY jsondb_id DESC",
            (statuses,),
        )
        return [row_to_dict(r) for r in cur.fetchall()]


@budgets_bp.get("/budgets/export")
@require_auth
def export_budgets():
    scope  = request.args.get("scope", "pending")
    fmt    = request.args.get("format", "csv").lower()
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
            return jsonify(error="伺服器未安裝 openpyxl，無法匯出 XLSX"), 500
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

    # default: CSV (UTF-8 BOM so Excel opens 中文 correctly)
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
# Accepts a file whose columns map to: 項目名稱 / 類別 / 預算負責人 / 金額
IMPORT_ALIASES = {
    "project_name": ["項目名稱", "project_name", "project", "案件名稱"],
    "category":     ["類別", "category", "判定類別"],
    "owner":        ["預算負責人", "owner", "負責人"],
    "amount":       ["金額", "amount", "金額 (NT$)"],
}


def _resolve_header(header):
    """Map a sheet header row to our field keys."""
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
    s = str(v).replace(",", "").replace("NT$", "").strip()
    try:
        return float(s)
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
    rows = []   # list of dicts: project_name, category, owner, amount
    try:
        if name.endswith(".xlsx"):
            from openpyxl import load_workbook
            wb = load_workbook(f, read_only=True, data_only=True)
            ws = wb.active
            data = list(ws.iter_rows(values_only=True))
            if not data:
                return jsonify(error="檔案是空的"), 400
            idx = _resolve_header(data[0])
            for r in data[1:]:
                rows.append(r)
        elif name.endswith(".csv"):
            raw = f.read().decode("utf-8-sig")
            reader = list(csv.reader(io.StringIO(raw)))
            if not reader:
                return jsonify(error="檔案是空的"), 400
            idx = _resolve_header(reader[0])
            rows = reader[1:]
        else:
            return jsonify(error="僅支援 .csv 或 .xlsx 檔案"), 400
    except Exception as e:
        return jsonify(error=f"檔案解析失敗：{e}"), 500

    if "project_name" not in idx:
        return jsonify(error="找不到「項目名稱」欄位"), 400

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
            for n, row in enumerate(rows, start=2):
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
                           RETURNING jsondb_id""",
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
        pass  # audit_logs.request_id may be NOT NULL/FK-constrained; never fail the import on logging
    return jsonify(inserted=inserted, skipped=skipped, errors=errors[:20])


# ── Timeline ──────────────────────────────────────────────────────────
@budgets_bp.get("/budgets/<int:jsondb_id>/timeline")
@require_auth
def get_timeline(jsondb_id):
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT log_id, action, operator, timestamp, diff_before, diff_after
                   FROM budget.audit_logs
                   WHERE request_id = %s
                   ORDER BY timestamp ASC""",
                (jsondb_id,),
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(timeline=rows)
