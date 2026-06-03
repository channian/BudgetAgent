"""Resolve an expert's (Mandarin) name → email address.

Lookup order:
  1. base.kh_ad_employees  (empname → email)  — primary
  2. Active Directory displayName              — fallback if LDAP configured
"""
import logging
import time
import psycopg2

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # seconds; avoids a DB round-trip on every dispatch
_cache: dict = {}  # {normalised_name: (email_or_None, expire_ts)}


def _norm(s):
    return "".join((s or "").split()).lower()


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

    email = _query_hr_db(expert_name)
    _cache[key] = (email, now + _CACHE_TTL)

    if email:
        return email

    # AD fallback (only if LDAP is configured)
    try:
        from utils.ldap_lookup import lookup_email_by_name
        return lookup_email_by_name(expert_name)
    except Exception as e:
        logger.debug("AD fallback failed for %r: %s", expert_name, e)
        return None
