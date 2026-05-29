"""
RPA 批次進件腳本 — 對應實際 DB schema
掃描 INPUT_DIR 內的 JSON 檔，寫入 budget.budget_requests，完成後移至 BACKUP_DIR。
"""

import os, json, datetime
import psycopg2, psycopg2.extras
from shutil import move

INPUT_DIR  = r"D:\AS\2026\預算AI Agent\新思路0409\系統flask\A1初步預算"
BACKUP_DIR = r"D:\AS\K20076\2026\預算AI Agent\新思路0409\系統flask\A1 BACKUP"

DB_CONFIG = {
    "dbname":   "CIM",
    "user":     "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":     "10.10.51.98",
    "port":     "5432",
    "options":  "-c search_path=budget",
}

# ai_result 是 JSONB 欄位；status / expert_decision 是 enum 欄位
INSERT_SQL = """
    INSERT INTO budget.budget_requests
        (project_name, week, category, sub_category, expert_name,
         ai_comment, ai_result, status)
    VALUES (%s, %s, %s, %s, %s, %s, %s, 'AI_REVIEW')
    ON CONFLICT (project_name) DO UPDATE SET
        week         = EXCLUDED.week,
        category     = EXCLUDED.category,
        sub_category = EXCLUDED.sub_category,
        expert_name  = EXCLUDED.expert_name,
        ai_comment   = EXCLUDED.ai_comment,
        ai_result    = EXCLUDED.ai_result
    RETURNING jsondb_id
"""


def batch_process():
    if not os.path.exists(INPUT_DIR):
        print(f"❌ 找不到輸入資料夾: {INPUT_DIR}")
        return
    os.makedirs(BACKUP_DIR, exist_ok=True)

    json_files = [f for f in os.listdir(INPUT_DIR) if f.endswith(".json")]
    if not json_files:
        print("ℹ️  目前資料夾內沒有新 JSON 檔案。")
        return

    print(f"📂 偵測到 {len(json_files)} 個新案件，開始匯入…")

    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor()
    ok, fail = 0, 0

    for file_name in json_files:
        file_path = os.path.join(INPUT_DIR, file_name)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            _, iso_week, _ = datetime.datetime.now().isocalendar()

            # ai_result 存成 JSONB，使用 psycopg2.extras.Json 包裝
            ai_result = psycopg2.extras.Json({
                "AI處置結果":       data.get("最終決策"),
                "保留案件的信心分數": data.get("AI對於保留案件的信心分數"),
            })

            cur.execute(INSERT_SQL, (
                data["案件名稱"],
                iso_week,
                data.get("判定類別"),
                data.get("判定系統"),
                data.get("負責專家"),
                data.get("原因", ""),
                ai_result,
            ))
            conn.commit()

            jsondb_id = cur.fetchone()[0]
            move(file_path, os.path.join(BACKUP_DIR, file_name))
            print(f"✅  jsondb_id={jsondb_id}  {data['案件名稱']}")
            ok += 1

        except Exception as e:
            conn.rollback()
            print(f"❌  {file_name} 失敗：{e}")
            fail += 1

    cur.close()
    conn.close()
    print(f"\n完成：{ok} 成功 / {fail} 失敗")


if __name__ == "__main__":
    batch_process()
