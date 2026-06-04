"""
RPA 批次進件腳本 — budget.json 格式（含 AI 判決欄位）
讀取單一 JSON 檔（物件或陣列皆可），將每筆案件寫入 budget.budget_requests。

補送邏輯：
  • 相同 AI 資料重複掃描         → 忽略
  • 案件審核中，AI 資料有變       → 原地更新
  • 案件已審理，AI 資料有變       → 建立補送案件「X（補送）」
"""

import os, json, hashlib, datetime
import psycopg2, psycopg2.extras

INPUT_FILE = r"D:\AS\2026\預算AI Agent\新思路0409\系統flask\A1初步預算\budget.json"

DB_CONFIG = {
    "dbname":   "CIM",
    "user":     "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":     "10.10.28.170",
    "port":     "5432",
    "options":  "-c search_path=budget",
}

DECIDED_STATUSES = ("CLOSED", "REJECTED", "PENDING_ACTION")


def _rpa_signature(category, sub_category, expert_name, ai_comment, ai_result_dict):
    """Stable fingerprint of RPA-controlled fields."""
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
    if not os.path.exists(INPUT_FILE):
        print(f"❌ 找不到輸入檔案: {INPUT_FILE}")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # 支援單一物件或陣列
    records = raw if isinstance(raw, list) else [raw]

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
        project = (data.get("案件名稱") or "").strip()
        if not project:
            print("⚠️  缺少案件名稱，略過此筆")
            continue

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

            # ── 1) Identical AI data → ignore ─────────────────────────
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
                           ai_comment=%s, ai_result=%s, updated_at=NOW()
                       WHERE id=%s RETURNING id""",
                    (category, sub_category, expert_name,
                     ai_comment, ai_result_pg, latest["id"]),
                )
                conn.commit()
                budget_id = cur.fetchone()["id"]
                print(f"🔄  updated id={budget_id}  {project}")
                ok += 1
                continue

            # ── 3) Already decided → create 補送 case ────────────────
            if latest and latest["status"] in DECIDED_STATUSES:
                insert_name = _next_supplement_name(cur, project)
                note = f"補送：原案件「{project}」(#{latest['id']}) 經審理後重新送件。"
                action = "補送"
            else:
                insert_name = project
                note = None
                action = "新增"

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
            print(f"✅  {action} id={budget_id}  {insert_name}")
            ok += 1

        except Exception as e:
            conn.rollback()
            print(f"❌  {project} 失敗：{e}")
            fail += 1

    cur.close()
    conn.close()
    print(f"\n完成：{ok} 成功 / {fail} 失敗")


if __name__ == "__main__":
    batch_process()
