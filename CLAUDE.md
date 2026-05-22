# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Agent 預算審核平台 (AI Agent Budget Review Platform) — an internal web system for ASE Smart System Department to manage and review AI Agent project budgets through a two-layer approval mechanism: AI auto-review (Layer 1) followed by expert manual review (Layer 2).

## Tech Context

- Frontend design files will be added to the repo (pending upload). All UI follows a Pinterest-style warm aesthetic: warm cream base, coral/berry accent colors, rounded corners.
- Backend connects to an existing PostgreSQL database (`CIM` dbname, `budget` schema) at `10.10.51.98:5432`.
- The DB schema is already provisioned per v1.2 spec — do not alter table definitions, only write application logic against the existing schema.
- RPA deposits AI-generated JSON files into a watched input folder; a batch processor ingests them into the DB.

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

| Module | Role Required |
|--------|--------------|
| 待簽核案件 | 審核人 / 專家 |
| 已簽核完成 | 全員 |
| AI Agent 圖書館 | 全員 |
| 派發中心人員設定 | 系統管理員 |
| 權限管理中心 | 系統管理員 |

Authentication is via Windows AD (Active Directory). On login, sync `name`, `department`, `role` from org directory into session.

## Development Branch

Active development branch: `claude/elegant-dijkstra-fxlPR`
