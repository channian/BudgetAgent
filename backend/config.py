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

SECRET_KEY = "pensieve-internal-2026"

# ── Active Directory (LDAP) ───────────────────────────────────────────
# Service account used only for read-only email lookups (not for user login).
# Leave LDAP_SERVER blank to disable AD lookup entirely.
import os
LDAP_SERVER   = os.getenv("LDAP_SERVER",   "")          # e.g. "10.10.51.10"
LDAP_DOMAIN   = os.getenv("LDAP_DOMAIN",   "ASE")       # NetBIOS domain name
LDAP_BASE_DN  = os.getenv("LDAP_BASE_DN",  "DC=ase,DC=com,DC=tw")
LDAP_BIND_USER = os.getenv("LDAP_BIND_USER", "")        # service account sAMAccountName
LDAP_BIND_PASS = os.getenv("LDAP_BIND_PASS", "")        # service account password

# ── SMTP (internal mail relay) ────────────────────────────────────────
# Point at your internal Exchange / SMTP relay.
# Leave SMTP_SERVER blank to disable email sending entirely.
SMTP_SERVER      = os.getenv("SMTP_SERVER",      "")    # e.g. "10.10.51.20"
SMTP_PORT        = int(os.getenv("SMTP_PORT",    "25"))
SMTP_SENDER      = os.getenv("SMTP_SENDER",      "Budget_AIAgent@aseglobal.com")
SMTP_SENDER_NAME = os.getenv("SMTP_SENDER_NAME", "預算AI審核平台")
# Safety checkpoint: every dispatch email is always CC'd to this address.
SMTP_ALWAYS_CC   = os.getenv("SMTP_ALWAYS_CC",   "Jarven_Chong@aseglobal.com")

