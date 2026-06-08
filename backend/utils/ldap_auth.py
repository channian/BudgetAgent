"""AD / LDAP authentication for login.

Tries to bind with the user's own credentials against Active Directory using
several strategies (modern DCs often reject plain NTLM over port 389 because
they require LDAP signing/sealing). Returns a dict with
{username, name, department, email} on success, or None.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def ad_authenticate(username: str, password: str) -> Optional[dict]:
    """
    Attempt to bind to AD as the user. Tries in order:
      1. SIMPLE UPN over LDAPS (user@fqdn) — works on DCs that require signing/channel-binding
      2. NTLM sealed/389  — satisfies "require signing" DCs via sealing
      3. NTLM plain/389   — classic, works on relaxed DCs
      4. NTLM LDAPS/636   — when port 389 is locked down

    The first strategy that binds wins. Every attempt prints its exact
    `conn.result` to stdout for diagnosis in the Flask console.
    """
    try:
        from ldap3 import (Server, Connection, Tls,
                           NTLM, SIMPLE, SUBTREE, NONE as LDAP_NONE)
        from config import LDAP_SERVER, LDAP_DOMAIN, LDAP_BASE_DN
    except ImportError as e:
        logger.warning("[AD] import failed (ldap3 not installed?): %s", e)
        return None

    if not LDAP_SERVER:
        logger.warning("[AD] LDAP_SERVER is empty in config.py")
        return None

    import ssl
    # Derive FQDN from base DN: DC=ase,DC=com,DC=tw → ase.com.tw
    fqdn = ".".join(p.split("=")[1] for p in LDAP_BASE_DN.split(",") if p.upper().startswith("DC="))
    user_nt  = f"{LDAP_DOMAIN}\\{username}"
    user_upn = f"{username}@{fqdn}"          # e.g. K20076@ase.com.tw
    tls      = Tls(validate=ssl.CERT_NONE)

    strategies = [
        # UPN simple bind over LDAPS — most compatible with modern DCs that require signing
        ("SIMPLE UPN/LDAPS", dict(
            server=Server(LDAP_SERVER, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
            user=user_upn, authentication=SIMPLE)),
        # NTLM with sealing — satisfies "require signing" DCs
        ("NTLM sealed/389", dict(
            server=Server(LDAP_SERVER, port=389, get_info=LDAP_NONE),
            user=user_nt, authentication=NTLM, session_security="ENCRYPT")),
        # Plain NTLM
        ("NTLM plain/389", dict(
            server=Server(LDAP_SERVER, port=389, get_info=LDAP_NONE),
            user=user_nt, authentication=NTLM)),
        # NTLM over LDAPS
        ("NTLM LDAPS/636", dict(
            server=Server(LDAP_SERVER, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
            user=user_nt, authentication=NTLM)),
    ]

    logger.warning("[AD] start auth  user_nt=%s  upn=%s  server=%s", user_nt, user_upn, LDAP_SERVER)
    last_result = None
    for label, kw in strategies:
        srv  = kw.pop("server")
        bind_user = kw.pop("user")   # each strategy carries its own user format
        try:
            conn = Connection(srv, user=bind_user, password=password, **kw)
            ok   = conn.bind()
            logger.warning("[AD] %s: bind_ok=%s  result=%s", label, ok, conn.result)
            if ok:
                return _read_profile(conn, username, LDAP_BASE_DN, SUBTREE)
            last_result = conn.result
        except Exception as e:
            logger.warning("[AD] %s: exception %s", label, e)
            last_result = str(e)

    logger.warning("[AD] all strategies failed for %s — last result: %s", user_nt, last_result)
    return None


def _read_profile(conn, username, base_dn, subtree) -> dict:
    """Read displayName / mail / department for the bound user."""
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
    # Bind succeeded but search failed/empty — auth still counts as success.
    return {"username": username, "name": username, "department": None, "email": None}


def _ldap_escape(value: str) -> str:
    for ch, esc in (("\\", "\\5c"), ("*", "\\2a"), ("(", "\\28"), (")", "\\29"), ("\x00", "\\00")):
        value = value.replace(ch, esc)
    return value
