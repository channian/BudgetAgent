import datetime
from db import cursor as db_cursor
from utils.audit import log as audit_log

# SLA 燈號門檻（天數，從 dispatch_date 起算）：
#   黃燈：第 3 天起亮燈，並每 3 天提醒一次
#   紅燈：提前一天於第 6 天起亮燈（避免拖到第 7 天才提醒），之後每天提醒
# 一旦案件填寫專家評論（進入待簽核），即停止提醒。
YELLOW_DAYS = 3
RED_DAYS    = 6


def check_sla_violations():
    now = datetime.datetime.now()
    try:
        with db_cursor() as cur:
            cur.execute(
                """SELECT id, status, expert_name, project_name, owner, dispatch_date
                   FROM budget.budget_requests
                   WHERE status = 'EXPERT_REVIEW'
                     AND dispatch_date IS NOT NULL
                     AND (expert_comment IS NULL OR expert_comment = '')"""
            )
            pending = [dict(r) for r in cur.fetchall()]
    except Exception:
        return  # DB unreachable; skip silently

    for row in pending:
        days = (now - row["dispatch_date"]).days
        if days >= RED_DAYS:
            _notify(row, "red", days)
        elif days >= YELLOW_DAYS and days % YELLOW_DAYS == 0:
            _notify(row, "yellow", days)


def _notify(row, level, days):
    if level == "red":
        msg = (
            f"🔴 案件「{row['project_name']}」(#{row['id']}) [SLA 紅燈] "
            f"已派發 {days} 天仍未完成專家審核，請今日盡速處理。"
        )
        label = "紅燈"
    else:
        msg = (
            f"🟡 案件「{row['project_name']}」(#{row['id']}) [SLA 黃燈] "
            f"已派發 {days} 天尚未完成專家審核，請盡速安排審核。"
        )
        label = "黃燈"

    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT id FROM budget.users WHERE role = ANY(%s)",
                (["admin", "viewer"],),
            )
            user_ids = {r["id"] for r in cur.fetchall()}

        # 同時直接通知負責專家
        if row.get("expert_name"):
            with db_cursor() as cur:
                cur.execute(
                    "SELECT id FROM budget.users WHERE name = %s",
                    (row["expert_name"],),
                )
                eu = cur.fetchone()
            if eu:
                user_ids.add(eu["id"])

        for uid in user_ids:
            # 同一天、同一燈號每位使用者只提醒一次
            with db_cursor() as cur:
                cur.execute(
                    """SELECT 1 FROM budget.notifications
                       WHERE user_id = %s
                         AND text LIKE %s
                         AND text LIKE %s
                         AND created_at::date = CURRENT_DATE""",
                    (uid, f"%#{row['id']}%", f"%SLA {label}%"),
                )
                if cur.fetchone():
                    continue
            with db_cursor(commit=True) as cur:
                cur.execute(
                    "INSERT INTO budget.notifications (user_id, text) VALUES (%s, %s)",
                    (uid, msg),
                )

        audit_log(row["id"], "SLA_REMINDER", "system", None,
                  {"status": row["status"], "level": level, "days": days,
                   "notified_roles": ["admin", "viewer", "expert"]})
    except Exception:
        pass
