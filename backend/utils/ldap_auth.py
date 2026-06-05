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
    Attempt to bind to AD as the user. Tries, in order:
      1. NTLM with session sealing (ENCRYPT) over 389  — satisfies "require signing" DCs
      2. plain NTLM over 389                            — classic, works on relaxed DCs
      3. NTLM over LDAPS (636)                          — when 389 is locked down

    The first strategy that binds wins. Every attempt prints its exact
    `conn.result` to stdout so the real rejection reason is always visible in
    the Flask console.
    """
    try:
        from ldap3 import (Server, Connection, Tls,
                           NTLM, SUBTREE, ENCRYPT, NONE as LDAP_NONE)
        from config import LDAP_SERVER, LDAP_DOMAIN, LDAP_BASE_DN
    except ImportError as e:
        logger.debug("ldap3 / config not available: %s", e)
        print(f"[AD] import failed: {e}", flush=True)
        return None

    if not LDAP_SERVER:
        print("[AD] LDAP_SERVER is empty in config.py", flush=True)
        return None

    import ssl
    user_nt = f"{LDAP_DOMAIN}\\{username}"
    tls     = Tls(validate=ssl.CERT_NONE)

    strategies = [
        ("NTLM sealed/389", dict(
            server=Server(LDAP_SERVER, port=389, get_info=LDAP_NONE),
            authentication=NTLM, session_security=ENCRYPT)),
        ("NTLM plain/389", dict(
            server=Server(LDAP_SERVER, port=389, get_info=LDAP_NONE),
            authentication=NTLM)),
        ("NTLM LDAPS/636", dict(
            server=Server(LDAP_SERVER, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
            authentication=NTLM)),
    ]

    print(f"[AD] start auth for {user_nt}  server={LDAP_SERVER}", flush=True)
    last_result = None
    for label, kw in strategies:
        server = kw.pop("server")
        try:
            conn = Connection(server, user=user_nt, password=password, **kw)
            ok   = conn.bind()
            print(f"[AD] {label}: bind_ok={ok}  result={conn.result}", flush=True)
            if ok:
                return _read_profile(conn, username, LDAP_BASE_DN, SUBTREE)
            last_result = conn.result
        except Exception as e:
            print(f"[AD] {label}: exception {e}", flush=True)
            last_result = str(e)

    logger.warning("AD: all bind strategies failed for %s — last: %s", username, last_result)
    print(f"[AD] all strategies failed for {user_nt} — last result: {last_result}", flush=True)
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
        print(f"[AD] profile search failed (bind was OK): {e}", flush=True)
    # Bind succeeded but search failed/empty — auth still counts as success.
    return {"username": username, "name": username, "department": None, "email": None}


def _ldap_escape(value: str) -> str:
    for ch, esc in (("\\", "\\5c"), ("*", "\\2a"), ("(", "\\28"), (")", "\\29"), ("\x00", "\\00")):
        value = value.replace(ch, esc)
    return value
