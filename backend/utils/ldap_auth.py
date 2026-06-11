"""AD / LDAP authentication for login.

NTLM is unavailable in this environment (OpenSSL 3.0 disables MD4).
We use SIMPLE bind over LDAPS with UPN format (user@domain) instead.
Tries multiple UPN suffixes in order until one succeeds.
"""
import logging
import ssl
from typing import Optional

logger = logging.getLogger(__name__)


def ad_authenticate(username: str, password: str) -> Optional[dict]:
    try:
        from ldap3 import Server, Connection, Tls, SIMPLE, SUBTREE, NONE as LDAP_NONE
        from config import LDAP_SERVER, LDAP_BASE_DN, LDAP_UPN_SUFFIX
    except ImportError as e:
        logger.warning("[AD] import failed (ldap3 not installed?): %s", e)
        return None

    if not LDAP_SERVER:
        logger.warning("[AD] LDAP_SERVER is empty in config.py")
        return None

    tls = Tls(validate=ssl.CERT_NONE)

    # Derive base FQDN from base DN as secondary candidate
    fqdn_from_dn = ".".join(
        p.split("=")[1] for p in LDAP_BASE_DN.split(",")
        if p.upper().startswith("DC=")
    )

    # Try configured suffix first, then fallback to base-DN derived domain
    upn_suffixes = list(dict.fromkeys([LDAP_UPN_SUFFIX, fqdn_from_dn]))

    logger.warning("[AD] start auth  user=%s  server=%s  trying suffixes=%s",
                   username, LDAP_SERVER, upn_suffixes)

    for suffix in upn_suffixes:
        upn = f"{username}@{suffix}"
        try:
            srv  = Server(LDAP_SERVER, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE)
            conn = Connection(srv, user=upn, password=password, authentication=SIMPLE)
            ok   = conn.bind()
            logger.warning("[AD] SIMPLE/636 upn=%s  bind_ok=%s  result=%s", upn, ok, conn.result)
            if ok:
                return _read_profile(conn, username, LDAP_BASE_DN, SUBTREE)
        except Exception as e:
            logger.warning("[AD] SIMPLE/636 upn=%s  exception: %s", upn, e)

    logger.warning("[AD] all suffix attempts failed for %s", username)
    return None


def _read_profile(conn, username, base_dn, subtree) -> dict:
    try:
        conn.search(
            base_dn,
            f"(sAMAccountName={_ldap_escape(username)})",
            search_scope=subtree,
            attributes=["displayName", "mail", "department"],
        )
        if conn.entries:
            entry = conn.entries[0]
            return {
                "username":   username,
                "name":       str(entry.displayName) if entry.displayName else username,
                "department": str(entry.department)  if entry.department  else None,
                "email":      str(entry.mail)        if entry.mail        else None,
            }
    except Exception as e:
        logger.warning("[AD] profile search failed (bind was OK): %s", e)
    return {"username": username, "name": username, "department": None, "email": None}


def _ldap_escape(value: str) -> str:
    for ch, esc in (("\\", "\\5c"), ("*", "\\2a"), ("(", "\\28"), (")", "\\29"), ("\x00", "\\00")):
        value = value.replace(ch, esc)
    return value
