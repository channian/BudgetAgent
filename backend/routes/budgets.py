import json, datetime
from flask import Blueprint, request, jsonify
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
    conditions = ["br.status = ANY(%s)"]
    params     = [statuses]

    if q:
        conditions.append(
            "(br.project_name ILIKE %s OR br.owner ILIKE %s OR br.budget_no ILIKE %s)"
        )
        like = f"%{q}%"
        params += [like, like, like]
    if category:
        conditions.append("br.category = %s")
        params.append(category)

    where = " AND ".join(conditions)
    try:
        with db_cursor() as cur:
            cur.execute(
                f"""SELECT br.*, u.department AS owner_dept
                    FROM budget.budget_requests br
                    LEFT JOIN budget.users u ON u.name = br.owner
                    WHERE {where}
                    ORDER BY br.updated_at DESC""",
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
    ai_str = json.dumps(ai_obj, ensure_ascii=False) if ai_obj else None
    status = "EXPERT_REVIEW" if ai_obj else "AI_REVIEW"

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """INSERT INTO budget.budget_requests
                       (project_name, week, category, sub_category, expert_name,
                        owner, amount, ai_comment, ai_result, status, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                   ON CONFLICT (project_name) DO UPDATE SET
                       week         = EXCLUDED.week,
                       category     = EXCLUDED.category,
                       sub_category = EXCLUDED.sub_category,
                       expert_name  = EXCLUDED.expert_name,
                       owner        = EXCLUDED.owner,
                       amount       = EXCLUDED.amount,
                       ai_comment   = EXCLUDED.ai_comment,
                       ai_result    = EXCLUDED.ai_result,
                       status       = EXCLUDED.status,
                       updated_at   = NOW()
                   RETURNING db_id""",
                (
                    data.get("project_name"),
                    iso_week,
                    data.get("category"),
                    data.get("sub_category"),
                    data.get("expert_name"),
                    data.get("owner", user.get("name", "")),
                    data.get("amount", 0),
                    data.get("ai_comment"),
                    ai_str,
                    status,
                ),
            )
            db_id = cur.fetchone()["db_id"]
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(db_id, "CREATE", user.get("name", "system"), None, data)
    return jsonify(db_id=db_id, status=status), 201


# ── Get single ────────────────────────────────────────────────────────
@budgets_bp.get("/budgets/<int:db_id>")
@require_auth
def get_budget(db_id):
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT br.*, u.department AS owner_dept
                   FROM budget.budget_requests br
                   LEFT JOIN budget.users u ON u.name = br.owner
                   WHERE br.db_id = %s""",
                (db_id,),
            )
            row = cur.fetchone()
    except Exception as e:
        return jsonify(error=str(e)), 500

    if not row:
        return jsonify(error="案件不存在"), 404
    return jsonify(budget=row_to_dict(row))


# ── Update (general fields) ───────────────────────────────────────────
@budgets_bp.put("/budgets/<int:db_id>")
@require_auth
def update_budget(db_id):
    data = request.json or {}
    user = current_user()

    allowed = {"expert_name", "owner", "amount", "category", "sub_category", "note", "expert_comment"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return jsonify(error="無可更新欄位"), 400

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE db_id = %s", (db_id,))
            before_row = cur.fetchone()
        if not before_row:
            return jsonify(error="案件不存在"), 404
        before = row_to_dict(before_row)

        set_clause = ", ".join(f"{k} = %s" for k in updates) + ", updated_at = NOW()"
        with db_cursor(commit=True) as cur:
            cur.execute(
                f"UPDATE budget.budget_requests SET {set_clause} WHERE db_id = %s RETURNING *",
                [*updates.values(), db_id],
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(db_id, "UPDATE", user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Approve (CLOSED) ──────────────────────────────────────────────────
@budgets_bp.post("/budgets/<int:db_id>/approve")
@require_auth
def approve_budget(db_id):
    data    = request.json or {}
    user    = current_user()
    comment = data.get("comment", "")

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE db_id = %s", (db_id,))
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
                       status          = 'CLOSED',
                       updated_at      = NOW()
                   WHERE db_id = %s
                   RETURNING *""",
                (comment, db_id),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(db_id, "APPROVE", user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Reject ─────────────────────────────────────────────────────────────
# final=False → PENDING_ACTION (return for supplement)
# final=True  → REJECTED (terminal)
@budgets_bp.post("/budgets/<int:db_id>/reject")
@require_auth
def reject_budget(db_id):
    data    = request.json or {}
    user    = current_user()
    comment = data.get("comment", "")
    final   = bool(data.get("final", False))

    new_status = "REJECTED" if final else "PENDING_ACTION"

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE db_id = %s", (db_id,))
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
                       status          = %s,
                       updated_at      = NOW()
                   WHERE db_id = %s
                   RETURNING *""",
                (comment, final, new_status, db_id),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    action = "REJECT_FINAL" if final else "RETURN_FOR_SUPPLEMENT"
    audit_log(db_id, action, user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Resubmit (PENDING_ACTION → EXPERT_REVIEW) ─────────────────────────
@budgets_bp.post("/budgets/<int:db_id>/resubmit")
@require_auth
def resubmit_budget(db_id):
    user = current_user()

    try:
        with db_cursor() as cur:
            cur.execute("SELECT * FROM budget.budget_requests WHERE db_id = %s", (db_id,))
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
                       expert_comment  = NULL,
                       updated_at      = NOW()
                   WHERE db_id = %s
                   RETURNING *""",
                (db_id,),
            )
            after = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500

    audit_log(db_id, "RESUBMIT", user.get("name", "system"), before, after)
    return jsonify(budget=after)


# ── Timeline ──────────────────────────────────────────────────────────
@budgets_bp.get("/budgets/<int:db_id>/timeline")
@require_auth
def get_timeline(db_id):
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT log_id, action, operator, timestamp, diff_before, diff_after
                   FROM budget.audit_logs
                   WHERE request_id = %s
                   ORDER BY timestamp ASC""",
                (db_id,),
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(timeline=rows)
