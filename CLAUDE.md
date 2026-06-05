# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **New here? Read `HANDOVER.md` first** — it tracks what's done, what's next,
> current config/hosts, and known traps. This file (CLAUDE.md) holds the fixed
> schema + rules; HANDOVER.md holds the living project state.

## Project Overview

AI Agent 預算審核平台 (AI Agent Budget Review Platform) — an internal web system for ASE Smart System Department to manage and review AI Agent project budgets through a two-layer approval mechanism: AI auto-review (Layer 1) followed by expert manual review (Layer 2).

## Tech Context

- Frontend design files will be added to the repo (pending upload). All UI follows a Pinterest-style warm aesthetic: warm cream base, coral/berry accent colors, rounded corners.
- Backend connects to an existing PostgreSQL database (`CIM` dbname, `budget` schema). **Current host: `10.10.28.170:5432`** (set in `backend/config.py`; `rpa/ingest.py` and `pensieve/pipeline_3.py` also point at this host).
- The DB schema is already provisioned per v1.2 spec — do not alter the core table definitions, only write application logic against the existing schema. (Exceptions: `rag_systems` / `rag_entries` and the `login_logs` table + `locked_by`/`locked_at` columns ARE created by the app via `CREATE TABLE / ALTER TABLE IF NOT EXISTS` on boot.)
- RPA / pensieve pipeline deposits AI-generated JSON into `budget.json`; `pensieve/pipeline_3.py` (clipboard → DB) or `rpa/ingest.py` (file → DB) ingests them with smart dedup / 補送 logic.
- Auth: empno (employee number, = Windows sAMAccountName) is the login id. AD server `10.10.10.2` (KHADDC04) validates the Windows password via NTLM; accounts must be pre-created (whitelist) in 權限管理中心. Name/email auto-synced from `base.kh_ad_employees` by empno.

## Database Schema (budget schema, already provisioned)

**budget.budget_requests** — core table
```
db_id          SERIAL PK
project_name   VARCHAR UNIQUE
week           INT                  -- ISO week number, auto-calculated on insert
category       VARCHAR
sub_category   VARCHAR NULL
expert_name    VARCHAR NULL
budget_no      VARCHAR NULL         -- filled later by downstream platform
dispatch_date  TIMESTAMP NULL       -- filled later by downstream platform
owner          VARCHAR
amount         DECIMAL
ai_comment     TEXT                 -- from RPA JSON "原因"
ai_result      VARCHAR              -- JSON string: {"AI處置結果":..., "保留案件的信心分數":...}
expert_comment TEXT NULL
expert_decision VARCHAR NULL        -- enum: "通過" | "退件"
sign_date      DATETIME NULL        -- set when expert clicks "完成簽核"
cycle_time     INT NULL             -- auto-calc: (sign_date - dispatch_date) in days
note           TEXT NULL
status         VARCHAR              -- see Status Lifecycle below
updated_at     TIMESTAMP
```

**budget.audit_logs**
```
log_id      INT PK
request_id  INT FK → budget_requests.db_id
action      VARCHAR
operator    VARCHAR
timestamp   DATETIME
diff_before TEXT
diff_after  TEXT
```

**budget.users**
```
id          INT PK
name        VARCHAR
department  VARCHAR
ad_account  VARCHAR UNIQUE
role        VARCHAR
email       VARCHAR
```

**budget.notifications**
```
notification_id  INT PK
user_id          INT FK → users.id
text             TEXT
read_at          DATETIME NULL
created_at       TIMESTAMP
```

**budget.rag_systems** — AI 圖書館 system categories (extension table, auto-provisioned on app boot by `backend/routes/library.py::init_library_schema`; seeded with 16 placeholders "系統 01"~"系統 16" when empty)
```
id           SERIAL PK
name         VARCHAR              -- system category name (renameable)
description  TEXT NULL
sort_order   INT DEFAULT 0
created_at   TIMESTAMP
```

**budget.rag_entries** — RAG knowledge / rule entries per system (extension table)
```
id           SERIAL PK
system_id    INT FK → rag_systems.id ON DELETE CASCADE
title        VARCHAR              -- required
keywords     TEXT NULL            -- comma-separated, used for search filter
content      TEXT NULL            -- rule / judgement basis
example      TEXT NULL
disposition  VARCHAR NULL         -- enum: "通過" | "退件" | "不適用"
note         TEXT NULL
created_by   VARCHAR              -- expert name from session
created_at   TIMESTAMP
updated_at   TIMESTAMP
```

> Note: `rag_systems` / `rag_entries` are extension tables added after the v1.2 spec to back the AI 圖書館 RAG knowledge base. Unlike the core tables, these ARE managed by the application (created via `CREATE TABLE IF NOT EXISTS` on boot). RBAC: systems are admin-only CRUD; entries are read-only for viewers, writable by expert/admin.

## Status Lifecycle

```
AI_REVIEW → EXPERT_REVIEW → CLOSED
                          ↘ PENDING_ACTION → EXPERT_REVIEW (resubmit loop)
                          ↘ REJECTED
```

Status color mapping (use exactly these hex values in UI):
- `AI_REVIEW`      → #7c3aed (purple)
- `EXPERT_REVIEW`  → #06b6d4 (cyan)
- `PENDING_ACTION` → #f59e0b (amber)
- `CLOSED`         → #10b981 (green)
- `REJECTED`       → #ef4444 (red)

## RPA JSON Ingest

RPA drops JSON files with this structure:
```json
{
  "案件名稱": "...",
  "判定類別": "...",
  "判定系統": "...",
  "負責專家": "...",
  "原因": "...",
  "最終決策": "通過 | 退件",
  "AI對於保留案件的信心分數": 60
}
```

Field mapping to DB:
- `案件名稱` → `project_name`
- `判定類別` → `category`
- `判定系統` → `sub_category`
- `負責專家` → `expert_name`
- `原因` → `ai_comment`
- `最終決策` + `AI對於保留案件的信心分數` → `ai_result` (JSON-encoded string)
- `week` → computed from `datetime.now().isocalendar()` as plain INT (e.g. 21)
- `status` → initial value `AI_REVIEW`

INSERT must use `ON CONFLICT (project_name) DO UPDATE` and `RETURNING db_id`.

## Workflow Rules

1. On JSON ingest: `db_id` auto-generated; `budget_no` and `dispatch_date` remain NULL.
2. AI fields (`ai_comment`, `ai_result`) are **read-only** in the frontend — never allow user edits.
3. Expert lock: only one expert may hold write access to a `budget_requests` row at a time (concurrency guard required).
4. On expert approval (`expert_decision = '通過'`): set `sign_date = NOW()`, compute `cycle_time`, set `status = CLOSED`.
5. On expert rejection (`expert_decision = '退件'`): set `status = PENDING_ACTION`, return to applicant.
6. Every status change and field mutation must write a row to `audit_logs` with before/after diff.
7. SLA Cron: if a record stays in `AI_REVIEW`, `EXPERT_REVIEW`, or `PENDING_ACTION` for >72 hours without update, trigger a notification and log the reminder.

## Navigation Modules & RBAC

| Module | Role Required | Status |
|--------|--------------|--------|
| 待簽核 | 全員（簽核動作限 boss/admin；專家評論限 expert/admin） | done |
| 已簽核完成 | 全員 | done |
| AI Agent 圖書館 | 全員（檢視）；entries 限 expert/admin 寫入；systems 限 admin | done |
| 派發中心人員設定 | 系統管理員 | done — 派發 + 寄信 + 確認框 |
| 權限管理中心 | 系統管理員 | done — 使用者 CRUD、empno 開通、HR 查詢帶入 |
| 使用狀況 | 系統管理員 | done — 登入紀錄 / 活躍度儀表板（`budget.login_logs`） |

Authentication is via Windows AD (NTLM, server `10.10.10.2`) using empno as the
login id; falls back to local password hash if AD is unreachable. On AD success,
`name` / `email` are synced from `base.kh_ad_employees` by empno. Accounts are
whitelist-only — no auto-provisioning.

**Concurrency lock**: the expert review form acquires a 15-min edit lock
(`locked_by` / `locked_at` on `budget_requests`) via `POST /api/budgets/<id>/lock`.
Any expert may open a case, but only the lock holder can submit; others see a
"正在被 X 編輯中" banner. Lock auto-releases on save, on page leave, or after TTL.

## Development Branch

Active development branch: `main` (changes pushed directly to `main`).
