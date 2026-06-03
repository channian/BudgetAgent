"""LDAP NTLM 驗證，改編自既有服務，移除主管鏈查詢（HVM 不需要）。"""
import logging
from typing import Optional
from ldap3 import Server, Connection, NTLM, SUBTREE, NONE as LDAP_GET_NONE
from database import settings

logger = logging.getLogger(__name__)

_ATTR_MAP = {
    "displayName": "display_name",
    "mail":        "email",
    "department":  "department",
    "title":       "title",
}


def authenticate_and_sync(username: str, password: str) -> Optional[dict]:
    """
    以 NTLM 驗證 AD 帳號。
    成功回傳 {username, display_name, email, department, title}，失敗回傳 None。
    """
    try:
         # get_info=NONE：不預先抓 AD schema，省去一次 round trip
        server = Server(settings.ldap_server, get_info=LDAP_GET_NONE)
        conn = Connection(
            server,
            user=f"{settings.ldap_domain}\\{username}",
            password=password,
            authentication=NTLM,
        )
        if not conn.bind():
            logger.warning("LDAP bind failed: %s", username)
            return None

        conn.search(
            settings.ldap_base_dn,
            f"(sAMAccountName={username})",
            search_scope=SUBTREE,
            attributes=list(_ATTR_MAP.keys()),
        )
        if not conn.entries:
            return None

        entry = conn.entries[0]
        user_info = {"username": username}
        for ldap_attr, field in _ATTR_MAP.items():
            val = getattr(entry, ldap_attr, None)
            user_info[field] = str(val) if val else None

        return user_info

    except Exception as e:
        logger.error("LDAP error for %s: %s", username, e)
        return None
