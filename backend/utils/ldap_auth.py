"""AD / LDAP authentication for login.

Tries to bind with the user's own credentials (NTLM) against Active Directory.
Returns a dict with {username, name, department, email} on success, or None.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def ad_authenticate(username: str, password: str) -> Optional[dict]:
    """
    Bind to AD as the user (NTLM). Returns basic profile on success, None on failure.
    Works with plain sAMAccountName (no domain prefix needed).
    """
    try:
        from ldap3 import Server, Connection, NTLM, SUBTREE, NONE as LDAP_NONE
        from config import LDAP_SERVER, LDAP_DOMAIN, LDAP_BASE_DN
    except ImportError as e:
        logger.debug("ldap3 / config not available: %s", e)
        return None

    if not LDAP_SERVER:
        return None

    try:
        server = Server(LDAP_SERVER, get_info=LDAP_NONE)
        conn = Connection(
            server,
            user=f"{LDAP_DOMAIN}\\{username}",
            password=password,
            authentication=NTLM,
        )
        if not conn.bind():
            logger.info("AD bind rejected for %s", username)
            return None

        conn.search(
            LDAP_BASE_DN,
            f"(sAMAccountName={_ldap_escape(username)})",
            search_scope=SUBTREE,
            attributes=["displayName", "mail", "department"],
        )
        if not conn.entries:
            return {"username": username, "name": username, "department": None, "email": None}

        entry = conn.entries[0]
        return {
            "username":   username,
            "name":       str(entry.displayName) if entry.displayName else username,
            "department": str(entry.department)  if entry.department  else None,
            "email":      str(entry.mail)        if entry.mail        else None,
        }
    except Exception as e:
        logger.warning("AD auth error for %s: %s", username, e)
        return None


def _ldap_escape(value: str) -> str:
    for ch, esc in (("\\", "\\5c"), ("*", "\\2a"), ("(", "\\28"), (")", "\\29"), ("\x00", "\\00")):
        value = value.replace(ch, esc)
    return value
