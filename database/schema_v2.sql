-- ═══════════════════════════════════════════════════════════════════════════
-- AI Agent 預算審核平台 — Database Schema v2.0
-- Database : CIM
-- Schema   : budget
-- Encoding : UTF-8
--
-- 執行方式 (psql):
--   psql -h 10.10.51.98 -U cim_admin -d CIM -f schema_v2.sql
--
-- 注意：本腳本使用 IF NOT EXISTS / IF EXISTS，可安全重複執行。
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 建立 schema ──────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS budget;
SET search_path = budget;


-- ══════════════════════════════════════════════════════════════════════════
-- TABLE 1 : budget.users
-- 系統使用者資料表，對應 Windows AD 帳號。
-- 登入時以 ad_account 查詢，密碼驗證由 AD 負責（目前任何密碼皆接受）。
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS budget.users (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    department  VARCHAR(100),
    ad_account  VARCHAR(100) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL DEFAULT '',        -- werkzeug pbkdf2 雜湊；銜接 AD 後可留空
    role        VARCHAR(20)  NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'expert', 'viewer')),
    email       VARCHAR(200),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  budget.users IS '系統使用者，對應 Windows AD 帳號';
COMMENT ON COLUMN budget.users.id         IS '自增主鍵';
COMMENT ON COLUMN budget.users.name       IS '顯示名稱（中文姓名）';
COMMENT ON COLUMN budget.users.department IS '所屬部門';
COMMENT ON COLUMN budget.users.ad_account IS '登入帳號（Windows AD 帳號，唯一）；支援中英文、數字及特殊符號（@、*、& 等）';
COMMENT ON COLUMN budget.users.password   IS 'werkzeug pbkdf2_sha256 雜湊密碼；銜接真實 AD 後此欄位可棄用';
COMMENT ON COLUMN budget.users.role       IS 'admin=系統管理員 | expert=專家複審 | viewer=唯讀';
COMMENT ON COLUMN budget.users.email      IS '電子郵件（選填）';


-- ══════════════════════════════════════════════════════════════════════════
-- TABLE 2 : budget.budget_requests
-- 預算審核主表。
--
-- 兩種寫入路徑共用同一張表，透過 project_name (UNIQUE) 合併：
--   路徑 A │ RPA 批次進件腳本：填入 AI 欄位 + project_name
--   路徑 B │ 人工建立預算單  ：填入 category / owner / amount
--
-- 狀態流轉：
--   AI_REVIEW → EXPERT_REVIEW → CLOSED
--                             ↘ PENDING_ACTION → EXPERT_REVIEW（重送迴圈）
--                             ↘ REJECTED
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS budget.budget_requests (
    -- ── 主鍵 / 識別 ──────────────────────────────────────────────
    id            SERIAL        PRIMARY KEY,
    budget_no     VARCHAR(30),                         -- 預算單號，由下游派發平台回填
    project_name  VARCHAR(300)  NOT NULL UNIQUE,       -- 唯一鍵（RPA + 人工共用）
    week          INT           NOT NULL,              -- ISO 週次（1-53），寫入時由應用層帶入

    -- ── 基本資料（人工填寫） ─────────────────────────────────────
    category      VARCHAR(100),                        -- 預算類別（自由文字）
    sub_category  VARCHAR(100),                        -- 判定類別（自由文字）
    expert_name   VARCHAR(100),                        -- 負責專家（自由文字）
    owner         VARCHAR(100),                        -- 預算負責人（自由文字）
    amount        DECIMAL(15,2) NOT NULL DEFAULT 0,    -- 金額（新台幣）

    -- ── AI 欄位（由 RPA 批次進件寫入，前端唯讀）─────────────────
    ai_result     JSONB,                               -- {"AI處置結果":"通過|退件","保留案件的信心分數":0-100}
    ai_comment    TEXT,                                -- AI 初審評論（原因）

    -- ── 專家複審欄位 ─────────────────────────────────────────────
    expert_decision VARCHAR(10)
                        CHECK (expert_decision IN ('通過', '退件')),
    expert_comment  TEXT,

    -- ── 流程時間欄位 ─────────────────────────────────────────────
    dispatch_date TIMESTAMP,                           -- 派送日期，由派發中心填入
    sign_date     TIMESTAMP,                           -- 完成簽核時間，核可時自動設為 NOW()
    cycle_time    INT,                                 -- 審核週期（天），= sign_date - dispatch_date

    -- ── 狀態 ─────────────────────────────────────────────────────
    status        VARCHAR(20)   NOT NULL DEFAULT 'AI_REVIEW'
                      CHECK (status IN (
                          'AI_REVIEW',
                          'EXPERT_REVIEW',
                          'PENDING_ACTION',
                          'CLOSED',
                          'REJECTED'
                      )),

    -- ── 其他 ─────────────────────────────────────────────────────
    note          TEXT,
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  budget.budget_requests IS '預算審核主表；RPA 與人工建單共用，以 project_name 為唯一鍵合併';
COMMENT ON COLUMN budget.budget_requests.id               IS '自增主鍵（應用層使用此 id 做所有操作）';
COMMENT ON COLUMN budget.budget_requests.budget_no        IS '預算單號，由下游派發平台非同步回填，初始為 NULL';
COMMENT ON COLUMN budget.budget_requests.project_name     IS '案件名稱；RPA 進件與人工建單的合併唯一鍵';
COMMENT ON COLUMN budget.budget_requests.week             IS 'ISO 週次 (1–53)，INSERT 時由應用層以 datetime.isocalendar() 帶入';
COMMENT ON COLUMN budget.budget_requests.category         IS '預算類別（自由文字，例：研發費用 / 資訊系統）';
COMMENT ON COLUMN budget.budget_requests.sub_category     IS '判定子類別（自由文字，例：軟體授權）';
COMMENT ON COLUMN budget.budget_requests.expert_name      IS '負責專家姓名（自由文字，由 RPA 進件帶入或人工填寫）';
COMMENT ON COLUMN budget.budget_requests.owner            IS '預算負責人姓名（自由文字，非 FK）';
COMMENT ON COLUMN budget.budget_requests.amount           IS '預算金額（新台幣，精確到分）';
COMMENT ON COLUMN budget.budget_requests.ai_result        IS 'RPA 寫入的 JSONB：{"AI處置結果":"通過","保留案件的信心分數":85}';
COMMENT ON COLUMN budget.budget_requests.ai_comment       IS 'AI 初審評論（RPA JSON 的「原因」欄位）；前端唯讀';
COMMENT ON COLUMN budget.budget_requests.expert_decision  IS '專家最終判定：通過 | 退件';
COMMENT ON COLUMN budget.budget_requests.dispatch_date    IS '派送至專家的時間，由派發中心填入；SLA 計時起點';
COMMENT ON COLUMN budget.budget_requests.sign_date        IS '核可完成時間，APPROVE 動作時自動設為 NOW()';
COMMENT ON COLUMN budget.budget_requests.cycle_time       IS '審核週期（天）= sign_date - dispatch_date；核可時自動計算';
COMMENT ON COLUMN budget.budget_requests.status           IS 'AI_REVIEW→EXPERT_REVIEW→CLOSED / PENDING_ACTION→EXPERT_REVIEW / REJECTED';
COMMENT ON COLUMN budget.budget_requests.created_at       IS '記錄首次建立時間（RPA 進件或人工建單）';

CREATE INDEX IF NOT EXISTS idx_br_status     ON budget.budget_requests (status);
CREATE INDEX IF NOT EXISTS idx_br_created    ON budget.budget_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_br_project    ON budget.budget_requests (project_name);
CREATE INDEX IF NOT EXISTS idx_br_dispatch   ON budget.budget_requests (dispatch_date)
    WHERE dispatch_date IS NOT NULL;


-- ══════════════════════════════════════════════════════════════════════════
-- TABLE 3 : budget.audit_logs
-- 稽核紀錄表，記錄所有狀態變更與欄位修改。
-- 每次 CREATE / UPDATE / APPROVE / REJECT / RESUBMIT / IMPORT 皆寫入一筆。
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS budget.audit_logs (
    id          SERIAL        PRIMARY KEY,
    request_id  INT           REFERENCES budget.budget_requests(id) ON DELETE SET NULL,
    action      VARCHAR(30)   NOT NULL,
    operator    VARCHAR(100)  NOT NULL,
    timestamp   TIMESTAMP     NOT NULL DEFAULT NOW(),
    diff_before JSONB,
    diff_after  JSONB
);

COMMENT ON TABLE  budget.audit_logs IS '所有狀態變更與欄位修改的稽核紀錄';
COMMENT ON COLUMN budget.audit_logs.id          IS '自增主鍵';
COMMENT ON COLUMN budget.audit_logs.request_id  IS 'FK → budget_requests.id；NULL 表示系統層級操作（如批次匯入）';
COMMENT ON COLUMN budget.audit_logs.action      IS 'CREATE | UPDATE | APPROVE | REJECT_FINAL | RETURN_FOR_SUPPLEMENT | RESUBMIT | IMPORT | SLA_REMINDER';
COMMENT ON COLUMN budget.audit_logs.operator    IS '執行操作的使用者姓名或 "system"';
COMMENT ON COLUMN budget.audit_logs.diff_before IS '變更前欄位快照（JSONB）';
COMMENT ON COLUMN budget.audit_logs.diff_after  IS '變更後欄位快照（JSONB）';

CREATE INDEX IF NOT EXISTS idx_al_request_id ON budget.audit_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_al_timestamp  ON budget.audit_logs (timestamp DESC);


-- ══════════════════════════════════════════════════════════════════════════
-- TABLE 4 : budget.notifications
-- 系統通知表，目前主要用於 SLA 超時催辦。
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS budget.notifications (
    id          SERIAL       PRIMARY KEY,
    user_id     INT          NOT NULL REFERENCES budget.users(id) ON DELETE CASCADE,
    text        TEXT         NOT NULL,
    read_at     TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  budget.notifications IS 'SLA 催辦與系統通知';
COMMENT ON COLUMN budget.notifications.id         IS '自增主鍵';
COMMENT ON COLUMN budget.notifications.user_id    IS 'FK → users.id；通知接收者';
COMMENT ON COLUMN budget.notifications.text       IS '通知訊息內容';
COMMENT ON COLUMN budget.notifications.read_at    IS 'NULL = 未讀；有值 = 已讀時間';

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
    ON budget.notifications (user_id)
    WHERE read_at IS NULL;


-- ══════════════════════════════════════════════════════════════════════════
-- 既有資料庫升級（已有 budget.users 但尚無 password 欄位時執行）
-- 新建資料庫可略過此段
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE budget.users
    ADD COLUMN IF NOT EXISTS password VARCHAR(255) NOT NULL DEFAULT '';

-- 移除 owner 角色（如果舊的 CHECK constraint 仍存在）
ALTER TABLE budget.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE budget.users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'expert', 'viewer'));

COMMENT ON COLUMN budget.users.password IS 'werkzeug pbkdf2_sha256 雜湊密碼；銜接真實 AD 後此欄位可棄用';


-- ══════════════════════════════════════════════════════════════════════════
-- 初始測試帳號（視需要取消註解執行）
-- 密碼請先以 Python 產生雜湊後填入，或執行下方 set_password.py 工具
-- ══════════════════════════════════════════════════════════════════════════
/*
-- 注意：password 欄位需填入 werkzeug 雜湊值，不可直接填明文。
-- 請先執行 database/set_password.py 產生雜湊，再 INSERT。
INSERT INTO budget.users (name, department, ad_account, password, role, email) VALUES
    ('系統管理員',  'IT 部門',  'admin',    '<hash>', 'admin',  'admin@ase.com'),
    ('張專家',      '審核部門', 'expert01', '<hash>', 'expert', 'expert01@ase.com'),
    ('林負責人',    '研發處',   'owner01',  '<hash>', 'owner',  'owner01@ase.com'),
    ('陳檢視者',    '財務部',   'viewer01', '<hash>', 'viewer', 'viewer01@ase.com')
ON CONFLICT (ad_account) DO NOTHING;
*/


-- ══════════════════════════════════════════════════════════════════════════
-- 快速驗證（執行後確認四張表皆存在）
-- ══════════════════════════════════════════════════════════════════════════
/*
SELECT table_name, obj_description(pgc.oid) AS comment
FROM information_schema.tables t
JOIN pg_class pgc ON pgc.relname = t.table_name
WHERE t.table_schema = 'budget'
ORDER BY table_name;
*/
