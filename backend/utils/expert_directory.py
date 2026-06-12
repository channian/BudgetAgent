"""Resolve an expert's (Mandarin) name → email address.

Lookup order:
  1. budget.users (name → email)               — primary; the email an admin
                                                  fills in at 權限管理中心
  2. base.kh_ad_employees  (empname → email)   — HR directory
  3. Active Directory displayName              — fallback if LDAP configured
"""
import logging
import time
import psycopg2

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # seconds; avoids a DB round-trip on every dispatch
_cache: dict = {}  # {normalised_name: (email_or_None, expire_ts)}


def _norm(s):
    return "".join((s or "").split()).lower()


def _query_users_db(expert_name: str):
    """Look up the email in budget.users by name (app-managed, admin-editable)."""
    from db import cursor as db_cursor
    try:
        with db_cursor() as cur:
            cur.execute(
                "SELECT email FROM budget.users WHERE name = %s AND email IS NOT NULL LIMIT 1",
                (expert_name,),
            )
            row = cur.fetchone()
        if row and row.get("email") and "@" in str(row["email"]):
            return str(row["email"]).strip()
    except Exception as e:
        logger.warning("users DB lookup failed for %r: %s", expert_name, e)
    return None


def _query_hr_db(expert_name: str):
    from config import HR_DB
    try:
        conn = psycopg2.connect(**HR_DB)
        cur  = conn.cursor()
        cur.execute(
            "SELECT email FROM kh_ad_employees WHERE empname = %s LIMIT 1",
            (expert_name,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row[0] and "@" in str(row[0]):
            return str(row[0]).strip()
    except Exception as e:
        logger.warning("HR DB lookup failed for %r: %s", expert_name, e)
    return None


def resolve_email(expert_name: str):
    """Return the email for an expert name, or None."""
    if not expert_name:
        return None

    key = _norm(expert_name)
    now = time.time()

    cached = _cache.get(key)
    if cached and now < cached[1]:
        return cached[0]

    # 1. App users table (權限管理中心) — highest priority
    email = _query_users_db(expert_name)
    # 2. HR employee directory
    if not email:
        email = _query_hr_db(expert_name)

    _cache[key] = (email, now + _CACHE_TTL)
    if email:
        return email

    # 3. AD fallback (only if LDAP is configured)
    try:
        from utils.ldap_lookup import lookup_email_by_name
        return lookup_email_by_name(expert_name)
    except Exception as e:
        logger.debug("AD fallback failed for %r: %s", expert_name, e)
        return None
