"""
RPA 批次進件腳本 — merged_output.json 格式
讀取單一 JSON 陣列檔，將每筆案件寫入 budget.budget_requests。

補送邏輯：
  • 相同資料重複掃描         → 忽略
  • 案件審核中，資料有變     → 原地更新
  • 案件已審理，資料有變     → 建立補送案件「X（補送）」
"""

import os, json, hashlib, datetime, shutil
import psycopg2, psycopg2.extras

# ⚠️ 請確認這兩個路徑在 RPA 機器上正確
INPUT_FILE = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\初步審核\merged_output.json"
BACKUP_DIR = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\系統flask\A1 BACKUP"

DB_CONFIG = {
    "dbname":   "CIM",
    "user":     "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":     "10.10.28.170",
    "port":     "5432",
    "options":  "-c search_path=budget",
}

DECIDED_STATUSES = ("CLOSED", "REJECTED", "PENDING_ACTION")


def _rpa_signature(category, sub_category, expert_name, note):
    """Stable fingerprint of RPA-controlled fields."""
    parts = [
        (category     or "").strip(),
        (sub_category or "").strip(),
        (expert_name  or "").strip(),
        (note         or "").strip(),
    ]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def _row_signature(row):
    """Compute RPA-field signature from a DB row dict."""
    parts = [
        (row.get("category")     or "").strip(),
        (row.get("sub_category") or "").strip(),
        (row.get("expert_name")  or "").strip(),
        (row.get("note")         or "").strip(),
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
    if not os.path.exists(INPUT_FILE):
        print(f"❌ 找不到輸入檔案: {INPUT_FILE}")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        records = json.load(f)

    if not isinstance(records, list):
        records = [records]

    if not records:
        print("ℹ️  JSON 檔案是空的，腳本結束。")
        return

    print(f"📂 讀取到 {len(records)} 筆案件，開始匯入…")
    os.makedirs(BACKUP_DIR, exist_ok=True)

    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    _, iso_week, _ = datetime.datetime.now().isocalendar()
    ok, fail = 0, 0

    for data in records:
        project      = (data.get("案件名稱") or "").strip()
        if not project:
            print("⚠️  缺少案件名稱，略過此筆")
            continue

        category     = data.get("判定類別")
        sub_category = data.get("判定系統")
        expert_name  = data.get("負責專家")
        note         = data.get("檔案實體清單")   # 檔案清單存入 note
        incoming_sig = _rpa_signature(category, sub_category, expert_name, note)

        try:
            # ── Fetch existing case + all 補送 versions ──────────────
            escaped = project.replace("%", r"\%").replace("_", r"\_")
            cur.execute(
                "SELECT * FROM budget.budget_requests "
                "WHERE project_name = %s OR project_name LIKE %s "
                "ORDER BY id DESC",
                (project, escaped + "（補送%"),
            )
            existing = [dict(r) for r in cur.fetchall()]

            # ── 1) Identical data → ignore ────────────────────────────
            if any(_row_signature(ex) == incoming_sig for ex in existing):
                print(f"⏭  資料未變，略過 {project}")
                ok += 1
                continue

            latest = existing[0] if existing else None

            # ── 2) Case still under review, data changed → update ────
            if latest and latest["status"] not in DECIDED_STATUSES:
                cur.execute(
                    """UPDATE budget.budget_requests SET
                           category=%s, sub_category=%s, expert_name=%s,
                           note=%s, updated_at=NOW()
                       WHERE id=%s RETURNING id""",
                    (category, sub_category, expert_name, note, latest["id"]),
                )
                conn.commit()
                budget_id = cur.fetchone()["id"]
                print(f"🔄  updated id={budget_id}  {project}")
                ok += 1
                continue

            # ── 3) Already decided → create 補送 case ────────────────
            if latest and latest["status"] in DECIDED_STATUSES:
                insert_name = _next_supplement_name(cur, project)
                insert_note = f"補送：原案件「{project}」(#{latest['id']}) 經審理後重新送件。"
                if note:
                    insert_note += f"\n{note}"
                action = "補送"
            else:
                insert_name = project
                insert_note = note
                action = "新增"

            cur.execute(
                """INSERT INTO budget.budget_requests
                       (project_name, week, category, sub_category, expert_name,
                        note, status)
                   VALUES (%s, %s, %s, %s, %s, %s, 'AI_REVIEW')
                   RETURNING id""",
                (insert_name, iso_week, category, sub_category,
                 expert_name, insert_note),
            )
            conn.commit()
            budget_id = cur.fetchone()["id"]
            print(f"✅  {action} id={budget_id}  {insert_name}")
            ok += 1

        except Exception as e:
            conn.rollback()
            print(f"❌  {project} 失敗：{e}")
            fail += 1

    cur.close()
    conn.close()

    # ── 備份原始檔案 ─────────────────────────────────────────────────
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"merged_output_{stamp}.json")
    shutil.move(INPUT_FILE, backup_path)
    print(f"\n完成：{ok} 成功 / {fail} 失敗")
    print(f"📦 原始檔案已備份至 {backup_path}")


if __name__ == "__main__":
    batch_process()
