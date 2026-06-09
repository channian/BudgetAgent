"""
Pipeline Step 2 — 從剪貼簿讀取線上 AI 審核結果並寫入資料庫
══════════════════════════════════════════════════════════════
流程：
  pipeline_1 → 分類結果複製至剪貼簿
  RPA 取走 → 送至線上 AI 審核
  線上 AI 輸出 → 複製至剪貼簿
  本腳本讀取剪貼簿 → 合併 pipeline_1 分類資訊 → 寫入 DB

剪貼簿輸入格式（線上 AI 輸出，JSON 陣列）：
  [
    {
      "案件名稱": "...",
      "最終決策": "通過 | 退件",
      "AI對於保留案件的信心分數": 85,
      "原因": "..."
    },
    ...
  ]

分類資訊（判定系統/判定類別/負責專家）從 system_defined.json 讀取並合併。
若找不到對應案件，仍可寫入 DB（分類欄位留空，待後續補齊）。

前置：
  • pipeline_1.py 已執行，system_defined.json 存在於 WORK_DIR
  • 剪貼簿已放入線上 AI 輸出的 JSON 陣列
  • 套件：pip install psycopg2-binary pyperclip
          （pyperclip 可選；若未安裝則需手動提供 JSON 檔案）
"""

import os, sys, json, re, hashlib, datetime, difflib
import psycopg2, psycopg2.extras

WORK_DIR            = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\初步審核"
SYSTEM_DEFINED_JSON = os.path.join(WORK_DIR, "system_defined.json")

# ── 資料庫設定 ──────────────────────────────────────────────────────────
DB_CONFIG = {
    "dbname":   "CIM",
    "user":     "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":     "10.10.28.170",
    "port":     "5432",
    "options":  "-c search_path=budget",
}
DECIDED_STATUSES      = ("CLOSED", "REJECTED", "PENDING_ACTION")
FUZZY_MATCH_THRESHOLD = 0.82


# ════════════════════════════════════════════════════════════════════════
#  讀取剪貼簿
# ════════════════════════════════════════════════════════════════════════
def _read_clipboard() -> str:
    """回傳剪貼簿文字；失敗回傳空字串。"""
    try:
        import pyperclip
        return pyperclip.paste()
    except Exception:
        pass

    try:
        import win32clipboard
        win32clipboard.OpenClipboard()
        text = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
        win32clipboard.CloseClipboard()
        return text or ""
    except Exception:
        pass

    return ""


def _parse_clipboard(text: str) -> list:
    """從文字解析案件陣列；支援頂層陣列或 {"案件審核結果":[...]} 包裝物件格式。"""
    text = text.strip()
    if not text:
        return []
    # 直接解析：頂層陣列 或 包裝物件
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # 支援 {"案件審核結果":[...]} 或任何 dict 內唯一的 list 值
            for key in ("案件審核結果", "results", "data", "cases"):
                if isinstance(data.get(key), list):
                    return data[key]
            # 若 dict 只有一個 list 值，直接取出
            list_vals = [v for v in data.values() if isinstance(v, list)]
            if len(list_vals) == 1:
                return list_vals[0]
    except json.JSONDecodeError:
        pass
    # 擷取第一個 [...] 區塊（前後有多餘說明文字時的 fallback）
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    return []


# ════════════════════════════════════════════════════════════════════════
#  合併 pipeline_1 分類資訊
# ════════════════════════════════════════════════════════════════════════
def _load_classification_map() -> dict:
    """讀 system_defined.json，回傳 {案件名稱: case_dict}。"""
    if not os.path.exists(SYSTEM_DEFINED_JSON):
        print(f"⚠️  找不到 {SYSTEM_DEFINED_JSON}，分類資訊將留空")
        return {}
    try:
        with open(SYSTEM_DEFINED_JSON, encoding="utf-8") as f:
            cases = json.load(f)
        return {c.get("案件名稱", ""): c for c in cases if c.get("案件名稱")}
    except Exception as e:
        print(f"⚠️  讀取 system_defined.json 失敗：{e}")
        return {}


def _norm_name(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"[\s\-_—–（）()【】\[\]、，,。./\\：:]+", "", s)
    return s.lower()


def _find_classification(name: str, cls_map: dict) -> dict:
    """以精確→正規化→模糊三階段在 cls_map 中找對應的 pipeline_1 分類紀錄。"""
    if name in cls_map:
        return cls_map[name]

    norm_in = _norm_name(name)
    for k, v in cls_map.items():
        if _norm_name(k) == norm_in:
            return v

    close = difflib.get_close_matches(name, list(cls_map.keys()), n=1, cutoff=FUZZY_MATCH_THRESHOLD)
    if close:
        return cls_map[close[0]]

    return {}


# ════════════════════════════════════════════════════════════════════════
#  DB 去重 / 補送邏輯（同 pipeline_2_old / rpa/ingest.py）
# ════════════════════════════════════════════════════════════════════════
def _rpa_signature(category, sub_category, expert_name, ai_comment, ai_result_dict):
    ai_str = json.dumps(ai_result_dict, sort_keys=True, ensure_ascii=False) if ai_result_dict else ""
    parts  = [
        (category     or "").strip(),
        (sub_category or "").strip(),
        (expert_name  or "").strip(),
        (ai_comment   or "").strip(),
        ai_str,
    ]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def _row_signature(row):
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


def _next_supplement_name(cur, base: str) -> str:
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


def _find_project(cur, incoming_name: str):
    """三階段模糊比對（精確 → 正規化 → difflib）。"""
    def _fetch_rows(name):
        esc = name.replace("%", r"\%").replace("_", r"\_")
        cur.execute(
            "SELECT * FROM budget.budget_requests "
            "WHERE project_name = %s OR project_name LIKE %s "
            "ORDER BY db_id DESC",
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

    close = difflib.get_close_matches(incoming_name, all_names, n=1, cutoff=FUZZY_MATCH_THRESHOLD)
    if close:
        rows = _fetch_rows(close[0])
        if rows:
            return close[0], rows

    return None, []


# ════════════════════════════════════════════════════════════════════════
#  寫入資料庫
# ════════════════════════════════════════════════════════════════════════
def _write_db(merged: list):
    print("\n🚀 開始寫入資料庫…")
    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    _, iso_week, _ = datetime.datetime.now().isocalendar()
    ok, fail = 0, 0

    for item in merged:
        project = (item.get("案件名稱") or "").strip()
        if not project:
            print("⚠️  缺少案件名稱，略過此筆")
            continue

        category     = item.get("判定類別") or None
        sub_category = item.get("判定系統") or None
        expert_name  = item.get("負責專家") or None
        ai_comment   = (item.get("原因") or "").strip()
        ai_result_dict = {
            "AI處置結果":        item.get("最終決策"),
            "保留案件的信心分數": item.get("AI對於保留案件的信心分數"),
        }
        ai_result_pg = psycopg2.extras.Json(ai_result_dict)
        incoming_sig = _rpa_signature(category, sub_category, expert_name,
                                      ai_comment, ai_result_dict)

        try:
            canonical, existing = _find_project(cur, project)
            if canonical and canonical != project:
                print(f"   🔀 模糊匹配：「{project}」→「{canonical}」")

            if any(_row_signature(ex) == incoming_sig for ex in existing):
                print(f"⏭  資料未變，略過 {project}")
                ok += 1
                continue

            latest = existing[0] if existing else None

            if latest and latest["status"] not in DECIDED_STATUSES:
                cur.execute(
                    """UPDATE budget.budget_requests SET
                           category=%s, sub_category=%s, expert_name=%s,
                           ai_comment=%s, ai_result=%s, updated_at=NOW()
                       WHERE db_id=%s RETURNING db_id""",
                    (category, sub_category, expert_name,
                     ai_comment, ai_result_pg, latest["db_id"]),
                )
                conn.commit()
                budget_id = cur.fetchone()["db_id"]
                print(f"🔄  updated db_id={budget_id}  {canonical or project}")
                ok += 1
                continue

            if latest and latest["status"] in DECIDED_STATUSES:
                base_name   = canonical or project
                insert_name = _next_supplement_name(cur, base_name)
                note = f"補送：原案件「{base_name}」(#{latest['db_id']}) 經審理後重新送件。"
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
                   RETURNING db_id""",
                (insert_name, iso_week, category, sub_category, expert_name,
                 ai_comment, ai_result_pg, note),
            )
            conn.commit()
            budget_id = cur.fetchone()["db_id"]
            print(f"✅  {action} db_id={budget_id}  {insert_name}")
            ok += 1

        except Exception as e:
            conn.rollback()
            print(f"❌  {project} 失敗：{e}")
            fail += 1

    cur.close()
    conn.close()
    print(f"\n完成：{ok} 成功 / {fail} 失敗")
    if ok > 0:
        print("請重新整理平台頁面查看案件。")


# ════════════════════════════════════════════════════════════════════════
def process():
    print("📋 讀取剪貼簿…")
    raw = _read_clipboard()

    if not raw:
        print("❌ 剪貼簿為空，請確認線上 AI 結果已複製至剪貼簿")
        return

    ai_results = _parse_clipboard(raw)
    if not ai_results:
        print("❌ 剪貼簿內容無法解析為 JSON 陣列，請確認格式正確")
        print(f"   （前 200 字）{raw[:200]}")
        return

    print(f"✅ 解析到 {len(ai_results)} 筆線上 AI 審核結果")

    cls_map = _load_classification_map()
    print(f"📂 已載入 {len(cls_map)} 筆 pipeline_1 分類資訊")

    merged = []
    for item in ai_results:
        name = (item.get("案件名稱") or "").strip()
        if not name:
            print("⚠️  某筆缺少案件名稱，略過")
            continue

        cls = _find_classification(name, cls_map)
        if not cls:
            print(f"  ⚠️  找不到「{name}」的分類資訊，改用 AI 輸出中的分類欄位")

        # system_defined.json 優先；找不到時用 AI 輸出中 echo 回來的分類欄位
        merged.append({
            "案件名稱":              name,
            "判定類別":              cls.get("判定類別") or item.get("判定類別"),
            "判定系統":              cls.get("判定系統") or item.get("判定系統"),
            "負責專家":              cls.get("負責專家") or item.get("負責專家"),
            "最終決策":              item.get("最終決策"),
            "AI對於保留案件的信心分數": item.get("AI對於保留案件的信心分數") or item.get("信心分數") or 0,
            "原因":                  item.get("原因", ""),
        })
        decision = item.get("最終決策", "?")
        score    = merged[-1]["AI對於保留案件的信心分數"]
        print(f"  ✔ {name}  →  {decision}（信心 {score}）")

    if not merged:
        print("ℹ️  沒有有效案件可寫入。")
        return

    _write_db(merged)


if __name__ == "__main__":
    process()
