# HANDOVER — AI Agent 預算審核平台

> **For the next AI/engineer picking up this project.** Read this top-to-bottom
> before touching code. It complements `CLAUDE.md` (which holds the schema +
> hard rules) — this file is the living "what's done / what's next" log.
>
> **Active branch:** `claude/elegant-dijkstra-fxlPR` — develop, commit, and push here.
> **Last updated:** 2026-06-03

---

## 1. What this system is

Internal two-layer budget-review platform for ASE Smart System Dept:
**AI auto-review (Layer 1)** → **expert manual review (Layer 2)** → boss/admin sign-off.

- **Frontend:** React 18 UMD + Babel Standalone, **no bundler**. Plain `.jsx`
  files loaded via `<script type="text/babel">` from
  `budget/AI Agent 預算審核平台.html`.
- **Backend:** Flask blueprints + psycopg2 (`RealDictCursor`), served on port 5000.
- **DB:** PostgreSQL, dbname `CIM`, schema `budget`. **Current host: `10.10.28.170:5432`**
  (was `10.10.51.98`, then `10.10.51.67` — see §6 for stale references still to fix).
- **RPA ingest:** `rpa/ingest.py` scans a Windows folder for JSON and inserts directly.

Architecture & startup steps live in `README.md`. Schema + immutable rules live in `CLAUDE.md`.

---

## 2. File map (where things live)

```
backend/
  app.py                  Flask app, blueprint registration, SLA scheduler boot
  config.py               DB + LDAP + SMTP config (ALL secrets/hosts here)
  db.py                   cursor() context manager, row_to_dict()
  routes/
    auth.py               login/logout/me + AD login w/ local fallback (Fix E)
    budgets.py            budget CRUD, smart ingest, dispatch+email, review/approve/reject, delete, import/export
    users.py              user management (roles: admin/boss/expert/viewer)
    notifications.py      in-app notifications
    library.py            AI 圖書館 RAG systems + entries (auto-creates tables on boot)
  utils/
    audit.py              audit_log() — writes budget.audit_logs
    sla.py                72h SLA check, runs every 6h via APScheduler
    ldap_lookup.py        AD lookup: expert name → email (for dispatch email)
    ldap_auth.py          AD bind authentication (for login, Fix E)
    email_service.py      SMTP HTML dispatch email + mandatory CC
    expert_directory.py   name→email resolver: mapping file FIRST, AD fallback
  data/
    expert_emails.csv     ← name→email mapping table (EDIT THIS / replace w/ .xlsx)

budget/                   FRONTEND (all client code)
  AI Agent 預算審核平台.html   entry point, script load order
  api.js                  API client + DB<->frontend mappers + copyToClipboard()
  app.jsx                 root component, routing, top-level handlers
  components.jsx          Icon, badges, Sidebar, Topbar, Toast (Fix D)
  page-list.jsx           pending/completed lists, batch sign, one-click dispatch
  page-detail.jsx         case detail, expert review, sign-off, delete menu, expert lock UI
  page-edit.jsx           create/edit budget form (incl. 負責專家 field)
  page-other.jsx          派發中心 (dispatch center) + AI 圖書館 + 權限管理
  page-login.jsx          login screen
  styles.css              all styling (warm cream / coral Pinterest aesthetic)
  data.js                 MOCK helpers (date/cycle/format), ROLES

rpa/ingest.py             ⚠️ RPA batch processor — SEE §6, it bypasses smart ingest
database/
  schema_v2.sql           full DDL (source of truth for tables)
  set_password.py         helper to set a user password hash
  gen_handover.py         generates the .docx handover (human-facing)
ad/                       reference samples (LDAP/email) — NOT wired into the app
```

---

## 3. What has been DONE (this session + prior)

### Core workflow ✅
- Budget CRUD; status lifecycle AI_REVIEW → EXPERT_REVIEW → CLOSED / REJECTED / PENDING_ACTION.
- **Role model:** `admin` / `boss` / `expert` / `viewer`. Only **boss + admin** can
  finalize sign-off; **expert** writes comment + recommendation only.
- Two-block pending view: 待簽核 (expert已評論) + 待專家簽核 (等待評論).
- Inline `✓ 簽核` per row + batch multi-select 一鍵簽核.
- One-click 派發 (dispatch) on list + per-case dispatch in 派發中心.
- Expert-name (`負責專家` = `expert_name`) field on create/edit form and list column.

### AI 圖書館 (RAG knowledge base) ✅
- 16 system categories (auto-seeded), each with CRUD entries (filterable).
- Tables `rag_systems` / `rag_entries` auto-created on boot (`library.py::init_library_schema`).
- `rag_systems.expert_name` shown on each system card.
- RBAC: systems admin-only; entries writable by expert/admin, read-only for viewer.

### Notifications & audit ✅
- In-app notification badge; admin sees ALL changes.
- Every status change / mutation writes `budget.audit_logs`.
- SLA cron (`utils/sla.py`) every 6h; no-repeat within 24h.

### Clipboard / UX ✅
- `copyToClipboard()` in `api.js` — uses `navigator.clipboard` on HTTPS,
  falls back to `document.execCommand` on plain-HTTP LAN. Two copy buttons
  (AI 初審原因 + 專家評論). All other text is manually selectable in list rows
  (row click suppressed while a text selection is active).

### Delete ✅
- Admin-only 刪除案件 in the detail `⋯` menu, requires a **deletion reason**
  (enforced both client + server side), logged to admin notification.

### AD / Email dispatch ✅ (NEW — needs config to go live, see §5)
- On 派發, backend resolves expert name → email and sends a styled HTML email.
  Resolution order: **`backend/data/expert_emails.csv|xlsx` mapping file → AD lookup**.
- Sender `Budget_AIAgent@aseglobal.com`, **always CC `Jarven_Chong@aseglobal.com`**.
- `email_status` returned to UI → **toast** shows sent / no_email / failed (Fix D).
- **AD login (Fix E):** login tries AD bind first (syncs name/dept/email, auto-provisions
  new users as `viewer`), falls back to local DB password if AD unconfigured/unreachable.

### Smart ingest / 補送 (NEW) ✅ *(see §6 caveat)*
- `create_budget` endpoint now fingerprints case content:
  - identical data re-sent → **ignored** (no DB write, no spam)
  - case still under review, data changed → **updated** in place
  - case already 已審理 (退件/補件/通過), data changed → **new `X（補送）` case**
  - import path won't overwrite already-reviewed cases.

### Expert write lock (Fix F) ✅
- If `expert_name` is set, only that exact expert (or admin) can POST `/review`.
  Backend returns 403; detail page shows a 🔒 banner + read-only textarea for others.

### Bug fixes ✅
- `ORDER BY created_at` (nonexistent column) → `ORDER BY id DESC` in list + export.

---

## 4. What to do NEXT (prioritized)

### 🔴 P0 — correctness, do first
1. **Reconcile `rpa/ingest.py` with the smart-ingest logic (§6).** The real RPA path
   bypasses all the 補送/re-scan handling and still uses host `10.10.51.98`.
   Decide: either (a) make `ingest.py` POST to the Flask `/api/budgets` endpoint, or
   (b) port the `_case_signature` / 補送 logic into `ingest.py`. Update its DB host to
   `10.10.28.170`. **Until this is done, the 補送 feature does NOT apply to real RPA drops.**
2. **Fill in production config** (`backend/config.py`, §5): LDAP_* and SMTP_* are blank,
   so AD login + dispatch email are currently **disabled** (graceful no-op).
3. **Populate `backend/data/expert_emails.csv`** (or drop an `.xlsx`) with real
   name→email rows. Template has 2 dummy rows.

### 🟠 P1 — robustness
4. **Batch sign transaction safety.** `page-list.jsx` batch sign loops individual
   `API.approve` calls with no rollback; a mid-batch failure leaves partial state.
   Consider a backend batch endpoint wrapped in one transaction.
5. **`updated_at` is never updated** after creation in most paths — the "最後更新"
   timestamp on the detail page can be stale. Set `updated_at = NOW()` on mutations.
6. **Verify `expert_name` matches AD `displayName` exactly** for email/lock to work.
   If AD names differ in format, adjust the search filter in `ldap_lookup.py` /
   `ldap_auth.py` or rely on the mapping file.

### 🟡 P2 — nice to have
7. WebSocket / SSE live push (currently manual refresh).
8. Confirmation dialog before dispatch (it sends email instantly on click).
9. Stale-host cleanup in docs (CLAUDE.md §Tech Context + README still say 10.10.51.98).

---

## 5. Configuration checklist (to go live)

Edit `backend/config.py` (or set as env vars — all use `os.getenv`):

| Key | Purpose | Status |
|-----|---------|--------|
| `DB.host` | Postgres host | ✅ `10.10.28.170` |
| `LDAP_SERVER` | AD host for login + email lookup | ⬜ **blank → AD disabled** |
| `LDAP_DOMAIN` | NetBIOS domain (default `ASE`) | ⬜ verify |
| `LDAP_BASE_DN` | search base | ⬜ verify (`DC=ase,DC=com,DC=tw`) |
| `LDAP_BIND_USER/PASS` | read-only service acct (email lookup only) | ⬜ blank |
| `SMTP_SERVER` | internal mail relay | ⬜ **blank → email disabled** |
| `SMTP_SENDER` | from address | ✅ `Budget_AIAgent@aseglobal.com` |
| `SMTP_ALWAYS_CC` | mandatory safety CC | ✅ `Jarven_Chong@aseglobal.com` |
| `backend/data/expert_emails.csv` | name→email mapping | ⬜ dummy data only |

> Everything is **fail-safe**: blank LDAP/SMTP means those features no-op without
> crashing. Login falls back to local DB password; dispatch still updates status.

---

## 6. ⚠️ KNOWN GOTCHAS / TRAPS

1. **`rpa/ingest.py` is the real ingest, and it bypasses `create_budget`.**
   The smart re-scan/補送 logic lives in the Flask endpoint, but RPA inserts
   directly via its own `INSERT ... ON CONFLICT (project_name) DO UPDATE`. It also
   still has the **old DB host `10.10.51.98`** and old Windows folder paths. This is
   the #1 thing to reconcile (P0-1).
2. **No build step.** Editing `.jsx` = just save; reload browser. There is no
   transpile/lint pipeline. Babel compiles in-browser. Keep JSX ES5/ES2015-safe.
3. **`config.py` contains plaintext DB password.** It's committed. Treat the repo as
   internal-only; consider moving secrets to env vars when productionizing.
4. **Script load order matters** (`AI Agent 預算審核平台.html`): `data.js` → `api.js`
   → components → pages → `app.jsx`. Globals are attached to `window`. If you add a
   new shared helper, expose it on `window` or load it before its consumers.
5. **Status & decision are VARCHAR + CHECK**, not enums. `users.role` CHECK now
   includes `boss` (see `schema_v2.sql`). Adding a new role requires a DDL migration.
6. **Two name fields are different:** `owner` (預算負責人, plain text) ≠ `expert_name`
   (負責專家, used for dispatch/email/lock). Don't conflate them.
7. **PK column is `id`** (SERIAL) everywhere in code, even though `CLAUDE.md` prose
   sometimes says `db_id`. Use `id`.

---

## 7. Dev workflow

```bash
# backend
cd backend && pip install -r requirements.txt && python app.py   # serves :5000 + frontend

# the frontend is served by Flask at /  — open http://<host>:5000
```

- Commit style: clear messages, end on the active branch `claude/elegant-dijkstra-fxlPR`.
- Push: `git push -u origin claude/elegant-dijkstra-fxlPR` (rebase if remote moved).
- Do **not** open a PR unless explicitly asked.
- After changing `.py`, sanity-check with `python -m py_compile <file>`.
- After changing `.js`, `node --check budget/api.js` (JSX files can't be node-checked).

---

## 8. Recent commit trail (newest first)

```
84d152d Fix D email toast; Fix E AD login w/ local fallback; Fix F named-expert write lock
13fef9c Fix ORDER BY id; smart ingest re-scan ignore + 補送 resubmission handling
000b174 Expert name->email mapping file (xlsx/csv) with AD fallback for dispatch
b20d363 DB host -> 10.10.28.170; sender + mandatory CC for dispatch email
1149aaa AD LDAP email lookup + SMTP dispatch notification on dispatch
67462f3 Add 負責專家 (expert name) input to budget create/edit form
9da2237 Manual text select in list rows without triggering navigation
807a1d7 Fix clipboard copy (execCommand fallback for HTTP)
228089f rag_systems.expert_name: card display + modal + DB migration
60e5366 Deletion reason required + logged
b332a66 Admin-only 刪除案件 in detail ⋯ menu + backend DELETE endpoint
```

---

*When you finish a chunk of work, update §3 (done) and §4 (next) so the chain of
handovers stays accurate.*
