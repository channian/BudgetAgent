"""
Pipeline Step 3 — 從剪貼簿取得 AI 審核結果並直接寫入資料庫
════════════════════════════════════════════════════════════
前置：將 pensieve LLM 的 AI 審核結果（含最終決策/原因/信心分數）複製到剪貼簿
輸入：剪貼簿
輸出：直接寫入 DB + 存 budget.json 備查

補送邏輯：
  • 相同 AI 資料重複掃描         → 忽略
  • 案件審核中，AI 資料有變       → 原地更新
  • 案件已審理，AI 資料有變       → 建立補送案件「X（補送）」
"""

import json, os, re, hashlib, datetime
import pyperclip
import psycopg2, psycopg2.extras

BUDGET_JSON = r"D:\AS\2026\預算AI Agent\新思路0409\系統flask\A1初步預算\budget.json"

DB_CONFIG = {
    "dbname":   "CIM",
    "user":     "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":     "10.10.28.170",
    "port":     "5432",
    "options":  "-c search_path=budget",
}

DECIDED_STATUSES = ("CLOSED", "REJECTED", "PENDING_ACTION")


# ── 剪貼簿解析 ───────────────────────────────────────────────────────────
def parse_clipboard():
    raw = pyperclip.paste().strip()
    if not raw:
        return None
    raw = re.sub(r"【.*?】", "", raw).strip()
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r"(\[.*\]|\{.*\})", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    return None


# ── 補送邏輯輔助函式 ─────────────────────────────────────────────────────
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


def _next_supplement_name(cur, base):
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


# ── 主流程 ───────────────────────────────────────────────────────────────
def process():
    # 1. 從剪貼簿取得資料
    data = parse_clipboard()
    if data is None:
        print("❌ 剪貼簿沒有有效的 JSON，請確認已複製 pensieve LLM 的回傳結果。")
        return

    records = data if isinstance(data, list) else [data]

    # 2. 存 budget.json 備查
    os.makedirs(os.path.dirname(BUDGET_JSON), exist_ok=True)
    with open(BUDGET_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"💾 budget.json 已儲存（{len(records)} 筆）")

    # 3. 寫入 DB
    print("🚀 開始寫入資料庫...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    _, iso_week, _ = datetime.datetime.now().isocalendar()
    ok, fail = 0, 0

    for item in records:
        project = (item.get("案件名稱") or "").strip()
        if not project:
            print("⚠️  缺少案件名稱，略過此筆")
            continue

        category     = item.get("判定類別")
        sub_category = item.get("判定系統")
        expert_name  = item.get("負責專家")
        ai_comment   = item.get("原因", "")
        ai_result_dict = {
            "AI處置結果":        item.get("最終決策"),
            "保留案件的信心分數": item.get("AI對於保留案件的信心分數"),
        }
        ai_result_pg  = psycopg2.extras.Json(ai_result_dict)
        incoming_sig  = _rpa_signature(category, sub_category, expert_name,
                                       ai_comment, ai_result_dict)

        try:
            escaped = project.replace("%", r"\%").replace("_", r"\_")
            cur.execute(
                "SELECT * FROM budget.budget_requests "
                "WHERE project_name = %s OR project_name LIKE %s "
                "ORDER BY id DESC",
                (project, escaped + "（補送%"),
            )
            existing = [dict(r) for r in cur.fetchall()]

            # 相同資料 → 忽略
            if any(_row_signature(ex) == incoming_sig for ex in existing):
                print(f"⏭  資料未變，略過 {project}")
                ok += 1
                continue

            latest = existing[0] if existing else None

            # 審核中 + 資料有變 → 更新
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

            # 已審理 → 補送
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
    if ok > 0:
        print("請重新整理平台頁面查看新案件。")


if __name__ == "__main__":
    process()
