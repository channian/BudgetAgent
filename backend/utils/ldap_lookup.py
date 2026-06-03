"""Query Active Directory to resolve an expert display name → email address.

Uses a read-only service account (LDAP_BIND_USER / LDAP_BIND_PASS) so the
lookup does not require the expert's own credentials.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def lookup_email_by_name(display_name: str) -> Optional[str]:
    """Return the AD mail address for the given displayName, or None."""
    try:
        from ldap3 import Server, Connection, NTLM, SUBTREE, NONE as LDAP_NONE
        from config import LDAP_SERVER, LDAP_DOMAIN, LDAP_BASE_DN, LDAP_BIND_USER, LDAP_BIND_PASS
    except ImportError as e:
        logger.warning("ldap3 not installed or config missing: %s", e)
        return None

    if not LDAP_SERVER or not LDAP_BIND_USER or not LDAP_BIND_PASS:
        logger.debug("AD lookup skipped — LDAP config not set")
        return None

    try:
        server = Server(LDAP_SERVER, get_info=LDAP_NONE)
        conn = Connection(
            server,
            user=f"{LDAP_DOMAIN}\\{LDAP_BIND_USER}",
            password=LDAP_BIND_PASS,
            authentication=NTLM,
            auto_bind=True,
        )
        conn.search(
            LDAP_BASE_DN,
            # search by displayName; escape any special chars in the name
            f"(&(objectClass=person)(displayName={_ldap_escape(display_name)}))",
            search_scope=SUBTREE,
            attributes=["mail"],
        )
        if not conn.entries:
            logger.info("AD: no entry for displayName=%r", display_name)
            return None

        mail = conn.entries[0].mail
        email = str(mail).strip() if mail else None
        if email and "@" in email:
            return email
        return None

    except Exception as e:
        logger.warning("AD lookup failed for %r: %s", display_name, e)
        return None


def _ldap_escape(value: str) -> str:
    """Minimal LDAP filter escaping for the displayName value."""
    for char, escaped in (
        ("\\", "\\5c"), ("*", "\\2a"), ("(", "\\28"), (")", "\\29"),
        ("\x00", "\\00"),
    ):
        value = value.replace(char, escaped)
    return value
