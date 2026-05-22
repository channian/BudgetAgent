# pensieve · AI Agent 預算審核平台

> ASE 智慧系統與新建工程部內部系統 — v1.2

AI Agent 專案預算的數位化審核系統，整合 **AI 自動初審（第一層）** 與 **專家人工複審（第二層）** 的雙層協作機制。

---

## 系統架構

```
┌─────────────────────────────────────────────────────────┐
│  Browser  (budget/AI Agent 預算審核平台.html)            │
│  React 18 UMD + Babel Standalone，無需打包工具           │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / JSON  (port 5000)
┌────────────────────────▼────────────────────────────────┐
│  Flask Backend  (backend/app.py)                        │
│  ├─ routes/auth.py          登入 / 登出 / 當前用戶       │
│  ├─ routes/budgets.py       預算單 CRUD + 審核動作       │
│  ├─ routes/notifications.py 站內通知                     │
│  ├─ utils/audit.py          稽核軌跡寫入                 │
│  └─ utils/sla.py            72h SLA 催辦 (APScheduler)  │
└────────────────────────┬────────────────────────────────┘
                         │ psycopg2
┌────────────────────────▼────────────────────────────────┐
│  PostgreSQL  10.10.51.98:5432                           │
│  dbname=CIM  schema=budget                              │
│  Tables: budget_requests / users / audit_logs /         │
│          notifications                                  │
└─────────────────────────────────────────────────────────┘

RPA → rpa/ingest.py → budget.budget_requests (批次進件)
```

---

## 快速啟動

### 1. 安裝後端相依套件

```bash
cd backend
pip install -r requirements.txt
```

### 2. 啟動 Flask API

```bash
python app.py
# → http://0.0.0.0:5000
```

### 3. 開啟前端

直接用瀏覽器開啟：

```
budget/AI Agent 預算審核平台.html
```

> 前端預設連接 `http://localhost:5000`。若後端部署在其他位置，在 HTML 載入前設定：
> ```html
> <script>window.API_BASE = "http://your-server:5000";</script>
> ```

---

## 目錄結構

```
BudgetAgent/
├── backend/
│   ├── app.py              Flask 入口 + SLA 排程器
│   ├── config.py           DB 連線設定
│   ├── db.py               psycopg2 context-manager
│   ├── requirements.txt
│   ├── routes/
│   │   ├── auth.py         POST /api/auth/login|logout  GET /api/auth/me
│   │   ├── budgets.py      CRUD + approve / reject / resubmit / timeline
│   │   └── notifications.py GET /api/notifications  PUT .../read
│   └── utils/
│       ├── audit.py        寫入 budget.audit_logs
│       └── sla.py          超時案件自動催辦
│
├── budget/                 前端（靜態 HTML + JSX）
│   ├── AI Agent 預算審核平台.html   入口
│   ├── api.js              API client + DB↔前端資料轉換層
│   ├── app.jsx             路由 + 全域狀態
│   ├── components.jsx      共用元件 (Sidebar, Topbar, Badge…)
│   ├── data.js             MOCK 工具函式 (fmtDate, cycleTime…)
│   ├── styles.css          Pinterest 暖色系 UI
│   ├── page-login.jsx      AD 登入頁
│   ├── page-list.jsx       待簽核 / 已完成 列表
│   ├── page-detail.jsx     詳情 + 審核工作台 + Timeline
│   ├── page-edit.jsx       新增 / 編輯預算單 + AI JSON 貼入
│   ├── page-other.jsx      AI Agent 圖書館 / 派發中心 / 權限管理
│   └── tweaks-panel.jsx    設計調色板（開發用）
│
└── rpa/
    └── ingest.py           RPA 批次進件腳本（掃描資料夾 → 寫入 DB）
```

---

## API 端點一覽

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/auth/login` | 帳號登入（查 `budget.users`） |
| `POST` | `/api/auth/logout` | 登出 |
| `GET`  | `/api/auth/me` | 當前登入用戶 |
| `GET`  | `/api/budgets?scope=pending\|completed` | 列表（含搜尋/類別篩選） |
| `POST` | `/api/budgets` | 建立預算單 |
| `GET`  | `/api/budgets/<id>` | 取得單筆 |
| `PUT`  | `/api/budgets/<id>` | 更新欄位 |
| `POST` | `/api/budgets/<id>/approve` | 核可 → `CLOSED` |
| `POST` | `/api/budgets/<id>/reject` | 退件（`final=true` → `REJECTED`；`false` → `PENDING_ACTION`） |
| `POST` | `/api/budgets/<id>/resubmit` | 補件重送 → `EXPERT_REVIEW` |
| `GET`  | `/api/budgets/<id>/timeline` | 稽核軌跡 |
| `GET`  | `/api/notifications` | 站內通知列表 |
| `PUT`  | `/api/notifications/<id>/read` | 標記已讀 |

---

## 案件狀態流程

```
RPA 進件
   ↓
AI_REVIEW ──────────────────────────────────────────────┐
   ↓ (派發至專家)                                        │
EXPERT_REVIEW                                           │
   ├─ 確認簽核「核可」   → CLOSED         (sign_date 寫入) │
   ├─ 確認簽核「退件」   → REJECTED       (最終)          │
   └─ 退回申請人補件     → PENDING_ACTION               │
                              ↓ (申請人重新遞交)         │
                         EXPERT_REVIEW ─────────────────┘
```

| 狀態 | 顏色 | HEX |
|------|------|-----|
| `AI_REVIEW` | 優雅紫 | `#7c3aed` |
| `EXPERT_REVIEW` | 科技藍 | `#06b6d4` |
| `PENDING_ACTION` | 警告琥珀 | `#f59e0b` |
| `CLOSED` | 安全綠 | `#10b981` |
| `REJECTED` | 危險紅 | `#ef4444` |

---

## RPA 進件腳本

```bash
# 將 JSON 檔放入 INPUT_DIR，執行：
python rpa/ingest.py
```

RPA JSON 格式（中文 key）：

```json
{
  "案件名稱": "...",
  "判定類別": "...",
  "判定系統": "...",
  "負責專家": "...",
  "原因": "...",
  "最終決策": "通過 | 退件",
  "AI對於保留案件的信心分數": 85
}
```

前端「AI JSON 一鍵貼入」**同時支援**上述中文 key 與英文 key（`decision / confidence / reason`）。

---

## 開發注意事項

- **DB Schema 已佈建**，請勿修改 table 定義，只撰寫應用邏輯。
- AI 欄位（`ai_comment`、`ai_result`）在前端為**唯讀**，不可讓使用者編輯。
- 每次狀態變更與欄位異動必須寫入 `budget.audit_logs`（已由 `utils/audit.py` 統一處理）。
- SLA 催辦排程每 6 小時執行一次，24 小時內同一案件不重複通知。
- Windows AD 認證尚未整合（規劃中），目前以 `budget.users.ad_account` 帳號直接驗證。

---

## 待辦事項

- [ ] Windows AD (LDAP) 認證整合
- [ ] WebSocket 即時推播（目前為手動 Refresh）
- [ ] CSV 匯出功能
- [ ] 派發中心自動派送邏輯
