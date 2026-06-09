DB = {
    "dbname":  "CIM",
    "user":    "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":    "10.10.28.170",
    "port":    "5432",
    "options": "-c search_path=budget",
}

# HR / AD employee database — used for expert name → email lookup
HR_DB = {
    "dbname":  "CIM",
    "user":    "postgres",
    "password": "1qaz2wsx",
    "host":    "10.10.28.170",
    "port":    "5432",
    "options": "-c search_path=base",
}

SECRET_KEY = "budget-ai-internal-2026"

# ── Active Directory (LDAP) ───────────────────────────────────────────
# Service account used only for read-only email lookups (not for user login).
# Leave LDAP_SERVER blank to disable AD lookup entirely.
import os
LDAP_SERVER   = os.getenv("LDAP_SERVER",   "10.10.10.2")    # KHADDC04
LDAP_DOMAIN   = os.getenv("LDAP_DOMAIN",   "KH")       # NetBIOS domain name
LDAP_BASE_DN  = os.getenv("LDAP_BASE_DN",  "DC=ase,DC=com,DC=tw")
# UPN suffix for SIMPLE bind — run: dsquery * -filter "(sAMAccountName=K20076)" -attr userPrincipalName
# to find the real suffix. Typically matches the company email domain.
LDAP_UPN_SUFFIX = os.getenv("LDAP_UPN_SUFFIX", "kh.asegroup.com")
LDAP_BIND_USER = os.getenv("LDAP_BIND_USER", "")        # service account sAMAccountName
LDAP_BIND_PASS = os.getenv("LDAP_BIND_PASS", "")        # service account password

# ── SMTP (internal mail relay) ────────────────────────────────────────
# Point at your internal Exchange / SMTP relay.
# Leave SMTP_SERVER blank to disable email sending entirely.
SMTP_SERVER      = os.getenv("SMTP_SERVER",      "10.12.10.31")
SMTP_PORT        = int(os.getenv("SMTP_PORT",    "25"))
SMTP_SENDER      = os.getenv("SMTP_SENDER",      "Budget_Agent@aseglobal.com")
SMTP_SENDER_NAME = os.getenv("SMTP_SENDER_NAME", "預算AI審核平台")
# Safety checkpoint: every dispatch email is always CC'd to this address.
SMTP_ALWAYS_CC   = os.getenv("SMTP_ALWAYS_CC",   "Jarven_Chong@aseglobal.com")

# ── 派發通知 Email 複審項目清單（可自行修改）─────────────────────────
# 每個字串為一個條列項目，依序顯示在 email 的「複審項目」區塊。
# 修改後重啟 backend 即生效，不需要動 email_service.py。
EMAIL_REVIEW_CHECKLIST = [
    "預算需求目的",
    "作法",
    "改善效益",
    "預算合理性",
    "是否核准預算",
]

# PS 附註說明（顯示在清單下方，留空字串則不顯示）
EMAIL_REVIEW_PS = (
    "預算合理性 專家需要加入說明：\n"
    "  1. 預算評估的參考數據是否合理建議\n"
    "  2. 源頭的 UM 評估及系統負載合理性建議（需求進行檢核）"
)

