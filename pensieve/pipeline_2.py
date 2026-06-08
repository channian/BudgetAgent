"""
Pipeline Step 2 — AI 初步審核 + 直接寫入資料庫（本地 LLM，全自動）
══════════════════════════════════════════════════════════════════════
讀 pipeline_1 的分類結果（system_defined.json），對每筆案件用本地 Ollama
依各系統專家標準（audit_prompt.md）做初步受理審查，然後「直接寫進 DB」，
不再經 pensieve、不再走剪貼簿。網頁重新整理即可看到。

穩定性保證（同一案件內容不會這次通過、下次退件）：
  ① 內容雜湊快取：相同內容 + 相同 prompt + 相同模型 → 直接重用先前結果。
  ② 固定 seed + temperature 0 + 貪婪解碼：即使快取未命中，重審也穩定。
  ③ 最終決策由程式依信心分數門檻強制推導，不依賴 LLM 自律。

輸入：system_defined.json（pipeline_1 輸出）
輸出：merged_output.json（審核結果存查）+ 寫入 budget.budget_requests
前置：Ollama 已啟動且模型已下載（ollama pull qwen2.5:7b）；DB 可連線。
"""

import os, sys, json, re, hashlib, datetime, difflib
import psycopg2, psycopg2.extras

# 共用金額擷取邏輯（與 pipeline_1 同步）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pipeline_1 import _extract_amount_digest

WORK_DIR    = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\初步審核"
CACHE_FILE  = os.path.join(WORK_DIR, "audit_cache.json")

# ── 本地 LLM 設定（Ollama）──────────────────────────────────────────────
# 審核比分類難，建議 14b 以上更穩；7b 為可接受下限。
LLM_MODEL            = "qwen2.5:7b"
OLLAMA_URL           = "http://localhost:11434"
LLM_MAX_CHARS        = 6000
LLM_RETRIES          = 2
LLM_SEED             = 42        # 固定 seed → 重審結果穩定
AUDIT_PASS_THRESHOLD = 70        # 信心分數 ≥ 此值 → 通過，否則退件

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
FUZZY_MATCH_THRESHOLD = 0.82   # difflib ratio; lower = 更寬鬆, 建議 0.78-0.90


# ════════════════════════════════════════════════════════════════════════
#  LLM 審核
# ════════════════════════════════════════════════════════════════════════
def _load_audit_prompt() -> str:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_prompt.md")
    with open(path, encoding="utf-8") as f:
        return f.read()


def _audit_call(case: dict, system_prompt: str) -> str:
    """Send one case to Ollama for audit; return raw JSON text ('' on connection error)."""
    import urllib.request
    import urllib.error

    full_text = case.get("所有檔案原文(按檔案分段)", "")
    snippet   = full_text[:LLM_MAX_CHARS]
    digest    = _extract_amount_digest(full_text)

    user_msg = (
        f"案件名稱：{case.get('案件名稱', '')}\n"
        f"判定系統：{case.get('判定系統', '')}\n"
        f"判定類別：{case.get('判定類別', '')}\n"
        f"負責專家：{case.get('負責專家', '')}\n"
        f"檔案實體清單：\n{case.get('檔案實體清單', '')}\n"
    )
    if digest:
        user_msg += f"\n【金額線索】（自動擷取）\n{digest}\n"
    user_msg += f"\n所有檔案原文（節錄）：\n{snippet}"

    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_msg},
        ],
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0,
            "seed": LLM_SEED,
            "top_k": 1,           # 貪婪解碼，移除取樣隨機性
            "top_p": 1,
        },
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            result = json.loads(resp.read())
        return (result.get("message", {}).get("content") or "").strip()
    except urllib.error.URLError:
        print(f"    ⚠️  無法連線 Ollama（{OLLAMA_URL}）— 請確認 Ollama 已啟動且模型已下載")
        return ""
    except Exception as e:
        print(f"    ⚠️  LLM 呼叫失敗：{e}")
        return ""


def _parse_audit_json(raw: str):
    if not raw:
        return None
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _to_int(v) -> int:
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        m = re.search(r"\d+", v)
        if m:
            return int(m.group(0))
    return 0


# ════════════════════════════════════════════════════════════════════════
#  內容雜湊快取（保證同案件內容結果一致）
# ════════════════════════════════════════════════════════════════════════
def _case_signature(case: dict, system_prompt: str) -> str:
    """指紋 = 內容 + 系統 + 類別 + prompt + 模型；任一改變即重新審核。"""
    parts = [
        case.get("判定系統", ""),
        case.get("判定類別", ""),
        case.get("所有檔案原文(按檔案分段)", ""),
        hashlib.sha256(system_prompt.encode("utf-8")).hexdigest(),
        LLM_MODEL,
    ]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def _load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_cache(cache: dict):
    os.makedirs(WORK_DIR, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def _audit_case(case: dict, system_prompt: str, cache: dict) -> dict:
    """
    回傳完整審核紀錄（含最終決策/信心分數/原因），保證有結果。
    先查快取；未命中才呼叫 LLM，並把 (分數, 原因) 寫回快取。
    最終決策每次都依當前門檻重新推導（門檻可調而不必重審）。
    """
    sig = _case_signature(case, system_prompt)

    if sig in cache:
        score  = _to_int(cache[sig].get("AI對於保留案件的信心分數"))
        reason = cache[sig].get("原因", "")
        print("    ⚡ 快取命中（結果與上次完全一致）")
    else:
        data = None
        for attempt in range(LLM_RETRIES):
            raw  = _audit_call(case, system_prompt)
            data = _parse_audit_json(raw)
            if data and "AI對於保留案件的信心分數" in data:
                break
            if raw:
                print(f"    ↻ 第 {attempt + 1} 次 JSON 解析失敗，重試…")

        if data:
            score  = _to_int(data.get("AI對於保留案件的信心分數"))
            reason = (data.get("原因") or "").strip()
            cache[sig] = {"AI對於保留案件的信心分數": score, "原因": reason}
            _save_cache(cache)
        else:
            # 兜底：不寫快取（暫時性失敗，下次應重試），給安全的退件 + 人工複審提示
            score  = 0
            reason = "AI 初步審核失敗（本地 LLM 無回應或輸出無法解析），請負責專家人工複審。"

    decision = "通過" if score >= AUDIT_PASS_THRESHOLD else "退件"
    return {
        "案件名稱":              case.get("案件名稱", ""),
        "判定類別":              case.get("判定類別", ""),
        "判定系統":              case.get("判定系統", ""),
        "負責專家":              case.get("負責專家", ""),
        "原因":                  reason,
        "最終決策":              decision,
        "AI對於保留案件的信心分數": score,
    }


# ════════════════════════════════════════════════════════════════════════
#  寫入資料庫（補送 / 去重邏輯，原 pipeline_3）
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


# ── Fuzzy project-name matching ──────────────────────────────────────
def _norm_name(s):
    """Strip spaces/dashes/brackets/punctuation and lowercase for comparison."""
    s = (s or "").strip()
    s = re.sub(r"[\s\-_—–（）()【】\[\]、，,。./\\：:]+", "", s)
    return s.lower()


def _find_project(cur, incoming_name):
    """
    Return (canonical_db_name, rows) for the best-matching existing project.
    Tries in order:
      1. Exact match + 補送 suffixes  (fastest, no false positives)
      2. Normalised exact match        (handles spacing / punctuation variants)
      3. difflib similarity >= FUZZY_MATCH_THRESHOLD  (handles typos / minor diffs)
    Returns (None, []) when no match found.
    """
    def _fetch_rows(name):
        esc = name.replace("%", r"\%").replace("_", r"\_")
        cur.execute(
            "SELECT * FROM budget.budget_requests "
            "WHERE project_name = %s OR project_name LIKE %s "
            "ORDER BY id DESC",
            (name, esc + "（補送%"),
        )
        return [dict(r) for r in cur.fetchall()]

    # 1. Exact
    rows = _fetch_rows(incoming_name)
    if rows:
        return incoming_name, rows

    # 2+3: pull all distinct names once
    cur.execute("SELECT DISTINCT project_name FROM budget.budget_requests")
    all_names = [r["project_name"] for r in cur.fetchall()]
    if not all_names:
        return None, []

    norm_in = _norm_name(incoming_name)

    # 2. Normalised exact
    for name in all_names:
        if _norm_name(name) == norm_in:
            rows = _fetch_rows(name)
            if rows:
                return name, rows

    # 3. Difflib similarity
    close = difflib.get_close_matches(
        incoming_name, all_names, n=1, cutoff=FUZZY_MATCH_THRESHOLD
    )
    if close:
        rows = _fetch_rows(close[0])
        if rows:
            return close[0], rows

    return None, []


def _write_db(results: list):
    print("\n🚀 開始寫入資料庫…")
    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    _, iso_week, _ = datetime.datetime.now().isocalendar()
    ok, fail = 0, 0

    for item in results:
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
                       WHERE id=%s RETURNING id""",
                    (category, sub_category, expert_name,
                     ai_comment, ai_result_pg, latest["id"]),
                )
                conn.commit()
                budget_id = cur.fetchone()["id"]
                print(f"🔄  updated id={budget_id}  {canonical or project}")
                ok += 1
                continue

            if latest and latest["status"] in DECIDED_STATUSES:
                base_name    = canonical or project
                insert_name  = _next_supplement_name(cur, base_name)
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
    if ok > 0:
        print("請重新整理平台頁面查看案件。")


# ════════════════════════════════════════════════════════════════════════
def process():
    defined_path = os.path.join(WORK_DIR, "system_defined.json")
    output_path  = os.path.join(WORK_DIR, "merged_output.json")

    if not os.path.exists(defined_path):
        print(f"❌ 找不到 {defined_path}，請先執行 pipeline_1.py")
        return

    with open(defined_path, encoding="utf-8") as f:
        cases = json.load(f)

    if not cases:
        print("ℹ️  沒有案件可審核。")
        return

    try:
        system_prompt = _load_audit_prompt()
    except FileNotFoundError:
        print("❌ 找不到 audit_prompt.md，請確認檔案在同一資料夾")
        return

    cache = _load_cache()
    print(f"🤖 本地 LLM（{LLM_MODEL}）開始初步審核 {len(cases)} 筆案件…")
    results, n_pass, n_reject = [], 0, 0
    for case in cases:
        print(f"  審核中：{case.get('案件名稱', '')}")
        rec = _audit_case(case, system_prompt, cache)
        results.append(rec)
        if rec["最終決策"] == "通過":
            n_pass += 1
        else:
            n_reject += 1
        print(f"    → {rec['最終決策']}（信心 {rec['AI對於保留案件的信心分數']}）")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=4, ensure_ascii=False)
    print(f"\n✅ 審核完成：通過 {n_pass} 筆 / 退件 {n_reject} 筆（共 {len(results)} 筆）")
    print(f"💾 已存 merged_output.json")

    _write_db(results)


if __name__ == "__main__":
    process()
