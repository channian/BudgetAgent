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

# ── 派發信 CC 設定（可自行修改，改完重啟 backend 生效）──────────────────
# 【1】固定 CC：每封派發信都會 CC 的對象（可填多個，用逗號隔開）
SMTP_ALWAYS_CC   = os.getenv("SMTP_ALWAYS_CC",   "Jarven_Chong@aseglobal.com")

# 【2】規則 CC：依案件屬性動態加入 CC。由上往下逐條比對，符合就把 cc 全部加入。
#   field  可用："category"(判定類別) / "system"(判定系統/sub_category) / "expert"(負責專家)
#   equals 為要比對的值（需完全相等）
#   cc     為符合時要加入的 email 清單
# 範例（依你的實際對象修改／增刪）：
EMAIL_CC_RULES = [
    # {"field": "category", "equals": "法遵 (ESH)", "cc": ["esh_manager@aseglobal.com"]},
    # {"field": "system",   "equals": "電力",        "cc": ["power_lead@aseglobal.com"]},
    # {"field": "expert",   "equals": "吳明華",       "cc": ["his_assistant@aseglobal.com"]},
]

# 【3】測試模式（測試階段請設 True，正式上線改 False）
#   True  → 略過所有 CC（固定 + 規則），只寄給專家本人，避免測試資料寄給老闆/主管。
#   False → CC 全部生效。
EMAIL_TEST_MODE = True

# 進階：測試模式下，若填了 email，會把「整封信（含給專家的）」全部改寄到這個信箱，
# 一封都不會寄到真人。留空字串則照常寄給專家本人、只是不寄任何 CC。
EMAIL_TEST_REDIRECT_TO = ""

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

