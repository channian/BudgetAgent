# Verify DB Write

確認 pipeline 執行後資料是否真的寫入資料庫的標準流程。

## Step 1 — 記錄執行前的 row count

```sql
-- 連到 PostgreSQL（host: 10.10.28.170:5432, dbname: CIM）
SELECT COUNT(*) FROM budget.budget_requests;
-- 記下這個數字，稱為 N_before
```

```bash
# 或用 psql 快速查
psql -h 10.10.28.170 -U <user> -d CIM -c "SELECT COUNT(*) FROM budget.budget_requests;"
```

## Step 2 — 執行 pipeline

```bash
# pipeline_2（綫上 AI，剪貼簿 → DB）
python pensieve/pipeline_2.py

# pipeline_2_normalize（同上，但去除 ai_comment 的 \n）
python pensieve/pipeline_2_normalize.py
```

觀察 console 輸出：
- 看到 `🚀 開始寫入資料庫…` → DB 連線成功
- 看到 `✅ <案件名稱> 寫入成功` → 該筆確認寫入
- 看到 `❌ 無法連線資料庫：...` → Step 3
- 看到 `❌ <案件名稱> 失敗：...` + traceback → Step 4

## Step 3 — 確認 DB 連線設定

打開 `pensieve/pipeline_2.py`，確認 `DB_CONFIG`：

```python
DB_CONFIG = {
    "host": "10.10.28.170",
    "port": 5432,
    "dbname": "CIM",
    "user": "...",
    "password": "...",
}
```

- host / port 不對 → 修正後重試
- psycopg2 未安裝 → `<venv>\Scripts\pip install psycopg2-binary`

## Step 4 — 確認 SQL 欄位名稱正確

**常見錯誤：** 程式裏用了 `db_id`，但實際資料表欄位名稱是 `id`。

```bash
# 查實際欄位
psql -h 10.10.28.170 -U <user> -d CIM -c "\d budget.budget_requests"
```

確認 SQL 裏所有地方都用 `id`，不是 `db_id`：
- `ORDER BY id DESC`
- `WHERE id = ...`
- `RETURNING id`
- `row["id"]`

## Step 5 — 執行後的 row count 對比

```sql
SELECT COUNT(*) FROM budget.budget_requests;
-- 應該 = N_before + (本次新增筆數)
```

如果數量沒增加，查最近幾筆確認：

```sql
SELECT id, project_name, status, updated_at
FROM budget.budget_requests
ORDER BY updated_at DESC
LIMIT 10;
```

## 常見根本原因對照表

| 症狀 | 原因 | 修法 |
|---|---|---|
| `❌ 無法連線資料庫` | host/port 錯，或 DB server 不通 | Step 3 確認 DB_CONFIG |
| `column "db_id" does not exist` | SQL 用 db_id，實際是 id | Step 4 全部改成 id |
| `ModuleNotFoundError: psycopg2` | psycopg2 沒裝在 venv | `pip install psycopg2-binary` |
| pipeline 跑完沒輸出 / 靜默失敗 | except 沒印 traceback | 加 `traceback.print_exc()` |
| count 沒變但有 `✅` 輸出 | CONFLICT 觸發 UPDATE（非 INSERT） | 正常行為，案件已存在只是更新 |
| 備份檔有但 DB 沒資料 | 檔案是舊版，新版還沒下載到主機 | 從 GitHub 手動下載最新版 pipeline |
