import decimal, datetime
from contextlib import contextmanager
import psycopg2, psycopg2.extras
from config import DB


@contextmanager
def cursor(commit=False):
    conn = psycopg2.connect(**DB)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
            if commit:
                conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row):
    """Convert a DB row to a JSON-serialisable dict."""
    d = {}
    for k, v in dict(row).items():
        if isinstance(v, decimal.Decimal):
            v = float(v)
        elif isinstance(v, (datetime.datetime, datetime.date)):
            v = v.isoformat()
        d[k] = v
    return d
