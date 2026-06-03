"""
RPA 批次進件腳本 — 對應實際 DB schema v2
掃描 INPUT_DIR 內的 JSON 檔，寫入 budget.budget_requests，完成後移至 BACKUP_DIR。

補送邏輯：
  • 相同 AI 資料重複掃描         → 忽略（no-op，移入 BACKUP）
  • 案件審核中，AI 資料有變       → 原地更新（保留 owner / amount）
  • 案件已審理，AI 資料有變       → 建立補送案件「X（補送）」
"""

import os, json, hashlib, datetime
import psycopg2, psycopg2.extras
from shutil import move

# ⚠️ 請確認這兩個路徑在 RPA 機器上仍然正確
INPUT_DIR  = r"D:\AS\2026\預算AI Agent\新思路0409\系統flask\A1初步預算"
BACKUP_DIR = r"D:\AS\K20076\2026\預算AI Agent\新思路0409\系統flask\A1 BACKUP"

DB_CONFIG = {
    "dbname":   "CIM",
    "user":     "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":     "10.10.28.170",
    "port":     "5432",
    "options":  "-c search_path=budget",
}

# Cases in these statuses have been acted on; re-ingesting changed data
# must NOT overwrite them — create a 補送 case instead.
DECIDED_STATUSES = ("CLOSED", "REJECTED", "PENDING_ACTION")


def _rpa_signature(category, sub_category, expert_name, ai_comment, ai_result_dict):
    """Stable fingerprint of the RPA-controlled fields only."""
    ai_str = json.dumps(ai_result_dict, sort_keys=True, ensure_ascii=False) if ai_result_dict else ""
    parts = [
        (category     or "").strip(),
        (sub_category or "").strip(),
        (expert_name  or "").strip(),
        (ai_comment   or "").strip(),
        ai_str,
    ]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def _row_signature(row):
    """Compute RPA-field signature from a DB row dict."""
    ai = row.get("ai_result")
    if isinstance(ai, dict):
        ai_str = json.dumps(ai, sort_keys=True, ensure_ascii=False)
    elif isinstance(ai, str):
        try:
            ai_str = json.dumps(json.loads(ai), sort_keys=True, ensure_ascii=False)
        except Exception:
            ai_str = ai or ""
    else:
        ai_str = ""
    parts = [
        (row.get("category")     or "").strip(),
        (row.get("sub_category") or "").strip(),
        (row.get("expert_name")  or "").strip(),
        (row.get("ai_comment")   or "").strip(),
        ai_str,
    ]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def _next_supplement_name(cur, base):
    """Return the next free 補送 project name: X（補送）, X（補送2）, …"""
    candidate, n = f"{base}（補送）", 1
    while True:
        cur.execute(
            "SELECT 1 FROM budget.budget_requests WHERE project_name = %s",
            (candidate,),
        )
        if not cur.fetchone():
            return candidate
        n += 1
        candidate = f"{base}（補送{n}）"


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
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    ok, fail = 0, 0

    for file_name in json_files:
        file_path = os.path.join(INPUT_DIR, file_name)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            _, iso_week, _ = datetime.datetime.now().isocalendar()

            project      = data["案件名稱"].strip()
            category     = data.get("判定類別")
            sub_category = data.get("判定系統")
            expert_name  = data.get("負責專家")
            ai_comment   = data.get("原因", "")
            ai_result_dict = {
                "AI處置結果":        data.get("最終決策"),
                "保留案件的信心分數": data.get("AI對於保留案件的信心分數"),
            }
            ai_result_pg  = psycopg2.extras.Json(ai_result_dict)
            incoming_sig  = _rpa_signature(category, sub_category, expert_name,
                                           ai_comment, ai_result_dict)

            # ── Fetch existing case + all 補送 versions ──────────────
            escaped = project.replace("%", r"\%").replace("_", r"\_")
            cur.execute(
                "SELECT * FROM budget.budget_requests "
                "WHERE project_name = %s OR project_name LIKE %s "
                "ORDER BY id DESC",
                (project, escaped + "（補送%"),
            )
            existing = [dict(r) for r in cur.fetchall()]

            # ── 1) Identical AI data → ignore (re-scan no-op) ────────
            if any(_row_signature(ex) == incoming_sig for ex in existing):
                print(f"⏭  資料未變，略過 {project}")
                move(file_path, os.path.join(BACKUP_DIR, file_name))
                ok += 1
                continue

            latest = existing[0] if existing else None

            # ── 2) Case still under review, data changed → update ────
            if latest and latest["status"] not in DECIDED_STATUSES:
                cur.execute(
                    """UPDATE budget.budget_requests SET
                           category=%s, sub_category=%s, expert_name=%s,
                           ai_comment=%s, ai_result=%s, updated_at=NOW()
                       WHERE id=%s RETURNING id""",
                    (category, sub_category, expert_name,
                     ai_comment, ai_result_pg, latest["id"]),
                )
                conn.commit()
                budget_id = cur.fetchone()["id"]
                move(file_path, os.path.join(BACKUP_DIR, file_name))
                print(f"🔄  updated id={budget_id}  {project}")
                ok += 1
                continue

            # ── 3) Already decided → create 補送 case ────────────────
            if latest and latest["status"] in DECIDED_STATUSES:
                insert_name = _next_supplement_name(cur, project)
                note = f"補送：原案件「{project}」(#{latest['id']}) 經審理後重新送件。"
            else:
                insert_name = project
                note = None

            cur.execute(
                """INSERT INTO budget.budget_requests
                       (project_name, week, category, sub_category, expert_name,
                        ai_comment, ai_result, status, note)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'AI_REVIEW', %s)
                   RETURNING id""",
                (insert_name, iso_week, category, sub_category, expert_name,
                 ai_comment, ai_result_pg, note),
            )
            conn.commit()
            budget_id = cur.fetchone()["id"]
            move(file_path, os.path.join(BACKUP_DIR, file_name))
            action = "補送" if note else "新增"
            print(f"✅  {action} id={budget_id}  {insert_name}")
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
