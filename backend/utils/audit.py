from psycopg2.extras import Json as PgJson
from db import cursor as db_cursor


def log(request_id, action, operator, before=None, after=None):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """INSERT INTO budget.audit_logs
               (request_id, action, operator, timestamp, diff_before, diff_after)
               VALUES (%s, %s, %s, NOW(), %s, %s)""",
            (
                request_id,
                action,
                operator,
                PgJson(before) if before is not None else None,
                PgJson(after)  if after  is not None else None,
            ),
        )
