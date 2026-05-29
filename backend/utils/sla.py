import datetime
from db import cursor as db_cursor
from utils.audit import log as audit_log

SLA_HOURS = 72


def check_sla_violations():
    threshold = datetime.datetime.now() - datetime.timedelta(hours=SLA_HOURS)
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT br.jsondb_id, br.status::text AS status,
                          br.expert_name, br.project_name,
                          br.owner AS owner_name
                   FROM budget.budget_requests br
                   WHERE br.status::text = ANY(%s)
                     AND br.dispatch_date IS NOT NULL
                     AND br.dispatch_date < %s""",
                (["AI_REVIEW", "EXPERT_REVIEW", "PENDING_ACTION"], threshold),
            )
            overdue = [dict(r) for r in cur.fetchall()]
    except Exception:
        return  # DB unreachable; skip silently

    for row in overdue:
        _notify(row)


def _notify(row):
    target_name = row.get("expert_name") or row.get("owner_name")
    if not target_name:
        return

    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT id FROM budget.users WHERE name = %s",
                (target_name,),
            )
            user = cur.fetchone()
        if not user:
            return

        # Skip if already notified in the last 24 h for this case
        with db_cursor() as cur:
            cur.execute(
                """SELECT 1 FROM budget.notifications
                   WHERE user_id = %s
                     AND text LIKE %s
                     AND created_at > NOW() - INTERVAL '24 hours'""",
                (user["id"], f"%#{row['jsondb_id']}%SLA%"),
            )
            if cur.fetchone():
                return

        msg = (
            f"[SLA 催辦] 案件「{row['project_name']}」(#{row['jsondb_id']}) "
            f"已超過 {SLA_HOURS} 小時未更新，請盡速處理。"
        )
        with db_cursor(commit=True) as cur:
            cur.execute(
                "INSERT INTO budget.notifications (user_id, text, created_at) VALUES (%s, %s, NOW())",
                (user["id"], msg),
            )

        audit_log(row["jsondb_id"], "SLA_REMINDER", "system", None, {"target": target_name})
    except Exception:
        pass
