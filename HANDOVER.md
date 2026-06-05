# HANDOVER — AI Agent 預算審核平台

> **For the next AI/engineer picking up this project.** Read this top-to-bottom
> before touching code. It complements `CLAUDE.md` (which holds the schema +
> hard rules) — this file is the living "what's done / what's next" log.
>
> **Active branch:** `main` — develop and push here directly.
> **Last updated:** 2026-06-05 (session 4)

---

## 1. What this system is

Internal two-layer budget-review platform for ASE Smart System Dept:
**AI auto-review (Layer 1, fully automated)** → **expert manual review (Layer 2)** → boss/admin sign-off.

- **Frontend:** React 18 UMD + Babel Standalone, **no bundler**. Plain `.jsx`
  files loaded via `<script type="text/babel">` from
  `budget/AI Agent 預算審核平台.html`.
- **Backend:** Flask blueprints + psycopg2 (`RealDictCursor`), served on port 5000.
- **DB:** PostgreSQL, dbname `CIM`, schema `budget`. **Current host: `10.10.28.170:5432`**
- **Pipeline (fully local, no cloud LLM):**
  `pensieve/pipeline_1.py` → `pensieve/pipeline_2.py` → DB (network refresh = done)

Architecture & startup steps live in `README.md`. Schema + immutable rules live in `CLAUDE.md`.

---

## 2. File map (where things live)

```
backend/
  app.py                  Flask app, blueprint registration, SLA scheduler boot
  config.py               DB + LDAP + SMTP config (ALL secrets/hosts here)
  db.py                   cursor() context manager, row_to_dict()
  routes/
    auth.py               login/logout/me — empno-based AD NTLM login + local fallback
    budgets.py            budget CRUD, dispatch+email, review/approve/reject, delete,
                          concurrency lock, batch sign, import/export
    users.py              user management (roles: admin/boss/expert/viewer)
    notifications.py      in-app notifications
    library.py            AI 圖書館 RAG systems + entries (auto-creates tables on boot)
  utils/
    audit.py              audit_log() — writes budget.audit_logs
    sla.py                72h SLA check, runs every 6h via APScheduler
    ldap_lookup.py        AD lookup: expert name → email (for dispatch email)
    ldap_auth.py          AD NTLM authentication (login)
    email_service.py      SMTP HTML dispatch email + mandatory CC
    expert_directory.py   name→email resolver: mapping file FIRST, AD fallback
  data/
    expert_emails.csv     ← name→email mapping table (EDIT THIS to add real emails)

budget/                   FRONTEND (all client code)
  AI Agent 預算審核平台.html   entry point, script load order matters (see §6)
  api.js                  API client + DB↔frontend mappers
  app.jsx                 root component, routing, notification polling (60s)
  components.jsx          Icon, badges, Sidebar, Topbar, Toast, notification bell
  page-list.jsx           pending/completed lists, batch sign, one-click dispatch
  page-detail.jsx         case detail, expert review, sign-off, concurrency lock UI
  page-edit.jsx           create/edit budget form
  page-other.jsx          派發中心 + AI 圖書館 + 權限管理 + 使用狀況
  page-login.jsx          login screen (empno + Windows password)
  styles.css              all styling (warm cream / coral Pinterest aesthetic)
  data.js                 MOCK helpers (date/cycle/format), ROLES

pensieve/
  pipeline_1.py           Step 1: keyword rules + local Ollama → classify system/category/expert
  pipeline_2.py           Step 2: local Ollama AI audit → direct DB write (primary path)
  classification_prompt.md  System prompt for pipeline_1 unknown-case classification
  audit_prompt.md           System prompt for pipeline_2 expert-standard audit
  [WORK_DIR]/
    system_defined.json   pipeline_1 output (all cases, always 100% classified)
    system_unknown.json   always empty [] (kept for backward compat)
    merged_output.json    pipeline_2 audit results (存查)
    audit_cache.json      pipeline_2 LLM result cache (content-hash keyed)

rpa/
  ingest.py               ⚠️ BACKUP ONLY — manual fallback DB importer for a pre-built
                           budget.json; not part of the normal pipeline flow
database/
  schema_v2.sql           full DDL (source of truth for tables)
  set_password.py         helper to set a user password hash
```

---

## 3. What has been DONE (all sessions)

### Web Platform ✅ (100% complete)
- Budget CRUD; status lifecycle `AI_REVIEW → EXPERT_REVIEW → CLOSED / REJECTED / PENDING_ACTION`.
- **Role model:** `admin` / `boss` / `expert` / `viewer`.
  Only **boss + admin** finalise sign-off; **expert** writes comment + recommendation.
- Two-block pending view: 待簽核 (已評論) + 待專家簽核 (等待評論).
- Inline `✓ 簽核` per row + batch multi-select 一鍵簽核 (atomic transaction, all-or-nothing).
- One-click 派發 (dispatch) on list + per-case dispatch in 派發中心.
- **Concurrency lock:** any expert can open a case, but only the lock holder can submit.
  Lock TTL = 15 min; auto-releases on save/cancel/page-leave. Banner shows "正在被 X 編輯中".
- **6 navigation modules** (all done, RBAC enforced):
  - 待簽核 / 已簽核完成 / AI Agent 圖書館 / 派發中心人員設定 / 權限管理中心 / 使用狀況
- **AD login:** empno = Windows login ID; NTLM via ldap3 (server `10.10.10.2` KHADDC04);
  name/email auto-synced from `base.kh_ad_employees`; whitelist-only (admin must pre-create);
  falls back to local password hash if AD unreachable.
- **使用狀況 dashboard:** KPI cards (total users, active 7d/30d, logins today) + per-user table.
- SLA cron: 72 h without update → in-app notification, every 6 h scan, no repeat within 24 h.
- Notification bell: unread badge, 60 s polling, mark-read.
- Dispatch email: expert name → email resolved from CSV → AD fallback; HTML email + mandatory CC.
- Confirmation dialog before dispatch.
- `updated_at = NOW()` on all state mutations; lock cleared on approve/reject.
- AI 圖書館 RAG knowledge base (16 system categories, CRUD entries, RBAC).
- Smart ingest / 補送: identical data → ignore; under-review + changed → update; decided + changed → 補送.
- Admin-only 刪除案件 with mandatory deletion reason, audit-logged.
- Category colour map (`CAT_NAME_TO_ID`) covers all real business categories (UTI/新工/CIM/ESH).

### Pipeline ✅ (100% complete, fully local)
- **pipeline_1 (classification):**
  - Keyword rule engine (ENTITY_MAPPING + 7-rule conflict resolution per 廠務設備邏輯決策官 spec).
  - Local Ollama fallback for cases rules can't resolve; guaranteed zero unknown output.
  - Retry (normal → strict prompt) + fuzzy whitelist match + Relayout fallback.
  - Extracts text from: `.pdf` `.pptx` `.docx` `.txt` `.xlsx` `.xlsm` `.xls`.
  - Excel rows joined with ` | ` so item↔amount stays on same line.
  - Money digest: pulls amount-bearing lines from full text into a `【金額線索】` block
    at the top of the LLM prompt, supporting rule 7 (pick highest-budget system).
  - 監控 merged into 資安 (no standalone 監控 category).

- **pipeline_2 (audit + DB write):**
  - Reads `system_defined.json`, audits each case with local Ollama using `audit_prompt.md`.
  - Determinism guarantee: content-hash cache (keyed by content+system+category+prompt+model);
    fixed seed + temperature 0 + greedy decoding (top_k 1); decision force-derived from threshold.
  - Same case content always produces the same result; changing prompt/model auto-invalidates cache.
  - LLM failure fallback: score 0 / 退件 / "請人工複審" (never a false pass).
  - Writes directly to PostgreSQL with full dedup/補送 logic. Network refresh = live.

- **pipeline_3:** deleted (absorbed into pipeline_2).

---

## 4. What to do NEXT (prioritized)

### 🔴 Must-do before go-live
1. **Fill in production config** (`backend/config.py`):
   - `LDAP_SERVER` = `10.10.10.2` (already discovered; confirm `LDAP_BASE_DN`, `LDAP_BIND_USER/PASS`)
   - `SMTP_SERVER` = `10.12.10.31` port 25 (from INI config)
   - Fill `backend/data/expert_emails.csv` with real name→email rows.

2. **Verify Windows paths in pipeline files** on the RPA machine:
   - `pipeline_1.py`: `INPUT_PATH` (network folder of case subfolders) and `WORK_DIR`
   - `pipeline_2.py`: `WORK_DIR` and `DB_CONFIG` (host is `10.10.28.170`, verify port/credentials)

3. **Install pipeline dependencies** on the Windows pipeline machine:
   ```bash
   pip install openpyxl xlrd python-pptx PyPDF2 python-docx psycopg2-binary
   ollama pull qwen2.5:7b          # minimum; 14b recommended for pipeline_2 audit
   ```

### 🟠 Nice to have
4. **Upgrade pipeline_2 audit model to 14b** (`LLM_MODEL = "qwen2.5:14b"` in pipeline_2.py).
   Audit task is harder than classification; 14b noticeably more reliable on multi-item checklist.
5. WebSocket / SSE live push (currently 60 s polling for notifications).
6. Old-format `.xls` requires `xlrd` (`pip install xlrd`). If not installed, pipeline_1 shows
   "[注意：xlrd 未安裝]" for that file and continues — non-fatal.

---

## 5. Configuration checklist (to go live)

Edit `backend/config.py` (or set as env vars — all use `os.getenv`):

| Key | Purpose | Status |
|-----|---------|--------|
| `DB.host` | Postgres host | ✅ `10.10.28.170` |
| `LDAP_SERVER` | AD host for login + email lookup | ⬜ set to `10.10.10.2` |
| `LDAP_DOMAIN` | NetBIOS domain | ⬜ verify (`ASE`) |
| `LDAP_BASE_DN` | search base | ⬜ verify (`DC=ase,DC=com,DC=tw`) |
| `LDAP_BIND_USER/PASS` | read-only service acct (email lookup) | ⬜ blank |
| `SMTP_SERVER` | internal mail relay | ⬜ set to `10.12.10.31` port 25 |
| `SMTP_SENDER` | from address | ✅ `Budget_AIAgent@aseglobal.com` |
| `SMTP_ALWAYS_CC` | mandatory safety CC | ✅ `Jarven_Chong@aseglobal.com` |
| `backend/data/expert_emails.csv` | name→email mapping | ⬜ dummy data only |

> Everything is **fail-safe**: blank LDAP/SMTP means those features no-op without
> crashing. Login falls back to local DB password; dispatch still updates status.

---

## 6. ⚠️ KNOWN GOTCHAS / TRAPS

1. **No build step.** Editing `.jsx` = just save; reload browser. There is no
   transpile/lint pipeline. Babel compiles in-browser. Keep JSX ES5/ES2015-safe.

2. **Script load order matters** (`AI Agent 預算審核平台.html`): `data.js` → `api.js`
   → components → pages → `app.jsx`. Globals are attached to `window`. If you add a
   new shared helper, expose it on `window` or load it before its consumers.

3. **`config.py` contains plaintext DB password.** It's committed. Treat the repo as
   internal-only; move secrets to env vars when productionizing.

4. **Two name fields are different:** `owner` (預算負責人, plain text) ≠ `expert_name`
   (負責專家, used for dispatch/email/lock). Don't conflate them.

5. **PK column is `id`** (SERIAL) everywhere in code, even though `CLAUDE.md` prose
   sometimes says `db_id`. Use `id`.

6. **`rpa/ingest.py` is a backup tool, not the main path.** The normal flow is
   `pipeline_1.py → pipeline_2.py`. `ingest.py` is for manually importing a
   pre-built `budget.json` outside the pipeline (e.g. restoring from backup).

7. **`audit_cache.json`** stores pipeline_2 LLM results keyed by content hash.
   To force a full re-audit (e.g. after updating `audit_prompt.md` for a rule change),
   delete this file — the cache auto-invalidates on prompt or model change, but a
   manual delete also works.

8. **`xls` vs `xlsx`:** pipeline_1 uses `xlrd` for old `.xls` and `openpyxl` for
   `.xlsx/.xlsm`. If `xlrd` is not installed, `.xls` files log a warning and are
   skipped (non-fatal). Run `pip install xlrd` on the pipeline machine to enable.

9. **Status & decision are VARCHAR + CHECK**, not enums. `users.role` CHECK includes
   `boss`. Adding a new role requires a DDL migration.

---

## 7. Dev workflow

```bash
# backend
cd backend && pip install -r requirements.txt && python app.py   # serves :5000 + frontend

# the frontend is served by Flask at /  — open http://<host>:5000

# pipeline (run from pensieve/)
python pipeline_1.py    # classify → system_defined.json
python pipeline_2.py    # audit + write DB → merged_output.json + audit_cache.json
```

- Active branch: `main`. Push directly — no PR needed unless explicitly requested.
- After changing `.py`: `python -m py_compile <file>` to sanity-check.
- After changing `.js`: `node --check budget/api.js` (JSX files can't be node-checked).
- `audit_prompt.md` and `classification_prompt.md` are the LLM rule documents —
  edit them to adjust audit criteria or classification rules. Cache auto-invalidates.

---

## 8. Recent commit trail (newest first)

```
7663a19 Collapse pipeline to 2 local steps; add deterministic audit cache, drop pipeline_3
fe96553 pipeline_2: local LLM AI audit (初步退件) replaces pensieve
69b11c8 pipeline_1: add Excel extraction + money digest for LLM budget judgement
10e6832 pipeline_1: local LLM fully replaces pensieve, guarantee zero unknown output
00af044 Add local Ollama LLM integration to pipeline_1 for unknown-case classification
21ab34c Merge 監控 into 資安 as a single system + add infosec keywords
a332852 Rework pipeline_1 classifier per 廠務設備邏輯決策官 spec
66a7494 Fix P2/P3: dispatch confirm, ingest crash, category colours, docs
```

---

*When you finish a chunk of work, update §3 (done) and §4 (next) so the chain of
handovers stays accurate.*
