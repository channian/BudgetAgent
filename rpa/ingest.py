"""
RPA 手動補入腳本（備援用，非主流程）
══════════════════════════════════════════════════════════════
⚠️  主流程已改為：
      pipeline_1.py（分類）→ pipeline_2.py（AI 審核 + 直接寫 DB）
    正常情況下不需要執行此腳本。

【此腳本的使用場景】
  - 手動補入一份已處理好的 budget.json（格式見下方），繞過 pipeline 直接寫 DB。
  - 適用於：pipeline 跑完後需要個別重補、或從舊格式備份還原案件。

【budget.json 格式】（單一物件或陣列皆可）
  {
    "案件名稱": "...",
    "判定類別": "...",
    "判定系統": "...",
    "負責專家": "...",
    "原因": "...",
    "最終決策": "通過 | 退件",
    "AI對於保留案件的信心分數": 60
  }

補送邏輯：
  • 相同 AI 資料重複掃描         → 忽略
  • 案件審核中，AI 資料有變       → 原地更新
  • 案件已審理，AI 資料有變       → 建立補送案件「X（補送）」
"""

import os, json, hashlib, datetime, difflib, re
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

DECIDED_STATUSES      = ("CLOSED", "REJECTED", "PENDING_ACTION")
FUZZY_MATCH_THRESHOLD = 0.82   # difflib ratio; 0.78-0.90 建議範圍


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


def _norm_name(s):
    s = (s or "").strip()
    # 移除前置日期（如「26.06.11_」「2026-06-11 」），避免 AI 擷取的日期
    # 前綴造成與人工建立案件名稱比對失敗
    s = re.sub(r"^\d{2,4}[./\-]\d{1,2}[./\-]\d{1,2}[\s_\-]*", "", s)
    s = re.sub(r"[\s\-_—–（）()【】\[\]、，,。./\\：:]+", "", s)
    return s.lower()


def _find_project(cur, incoming_name):
    """Return (canonical_db_name, rows) using exact → normalised → difflib fallback."""
    def _fetch_rows(name):
        esc = name.replace("%", r"\%").replace("_", r"\_")
        cur.execute(
            "SELECT * FROM budget.budget_requests "
            "WHERE project_name = %s OR project_name LIKE %s "
            "ORDER BY id DESC",
            (name, esc + "（補送%"),
        )
        return [dict(r) for r in cur.fetchall()]

    rows = _fetch_rows(incoming_name)
    if rows:
        return incoming_name, rows

    cur.execute("SELECT DISTINCT project_name FROM budget.budget_requests")
    all_names = [r["project_name"] for r in cur.fetchall()]
    if not all_names:
        return None, []

    norm_in = _norm_name(incoming_name)
    for name in all_names:
        if _norm_name(name) == norm_in:
            rows = _fetch_rows(name)
            if rows:
                return name, rows

    close = difflib.get_close_matches(
        incoming_name, all_names, n=1, cutoff=FUZZY_MATCH_THRESHOLD
    )
    if close:
        rows = _fetch_rows(close[0])
        if rows:
            return close[0], rows

    return None, []


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
            canonical, existing = _find_project(cur, project)
            if canonical and canonical != project:
                print(f"   🔀 模糊匹配：「{project}」→「{canonical}」")

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
                print(f"🔄  updated id={budget_id}  {canonical or project}")
                ok += 1
                continue

            # ── 3) Already decided → create 補送 case ────────────────
            if latest and latest["status"] in DECIDED_STATUSES:
                base_name   = canonical or project
                insert_name = _next_supplement_name(cur, base_name)
                note = f"補送：原案件「{base_name}」(#{latest['id']}) 經審理後重新送件。"
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
