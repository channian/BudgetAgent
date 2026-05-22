import datetime
from db import cursor as db_cursor
from utils.audit import log as audit_log

SLA_HOURS = 72


def check_sla_violations():
    threshold = datetime.datetime.now() - datetime.timedelta(hours=SLA_HOURS)
    with db_cursor() as cur:
        cur.execute(
            """SELECT db_id, status, expert_name, owner, project_name
               FROM budget.budget_requests
               WHERE status IN ('AI_REVIEW', 'EXPERT_REVIEW', 'PENDING_ACTION')
                 AND updated_at < %s""",
            (threshold,),
        )
        overdue = [dict(r) for r in cur.fetchall()]

    for row in overdue:
        _notify(row)


def _notify(row):
    target_name = row.get("expert_name") or row.get("owner")
    if not target_name:
        return

    with db_cursor() as cur:
        cur.execute("SELECT id FROM budget.users WHERE name = %s", (target_name,))
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
            (user["id"], f"%#{row['db_id']}%SLA%"),
        )
        if cur.fetchone():
            return

    msg = (
        f"[SLA 催辦] 案件「{row['project_name']}」(#{row['db_id']}) "
        f"已超過 {SLA_HOURS} 小時未更新，請盡速處理。"
    )
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO budget.notifications (user_id, text, created_at) VALUES (%s, %s, NOW())",
            (user["id"], msg),
        )

    audit_log(row["db_id"], "SLA_REMINDER", "system", None, {"target": target_name})
