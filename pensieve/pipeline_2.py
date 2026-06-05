"""
Pipeline Step 2 — AI 初步審核（本地 LLM，取代 pensieve）
══════════════════════════════════════════════════════════════
對 pipeline_1 產出的「已分類」案件，逐筆呼叫本地 Ollama LLM，
依各系統專家標準（audit_prompt.md）做初步受理審查（初步退件）。

輸入：system_defined.json（pipeline_1 輸出，已分類）
輸出：
  - merged_output.json   (精簡版：含 最終決策/信心分數/原因，供寫 DB)
  - 自動複製到剪貼簿       (pipeline_3 直接讀取寫入 DB)

規則：信心分數 < AUDIT_PASS_THRESHOLD → 退件；≥ → 通過。
      最終決策由本檔依分數強制覆寫，確保與規則一致。

前置：Ollama 已啟動，且模型已下載（ollama pull qwen2.5:7b）。
下一步：執行 pipeline_3.py。
"""

import os, sys, json, re
import pyperclip

# 共用金額擷取邏輯（與 pipeline_1 同步，避免重複維護）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pipeline_1 import _extract_amount_digest

WORK_DIR = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\初步審核"

# ── 本地 LLM 設定（Ollama）──────────────────────────────────────────────
# 審核比分類更難（要對多項標準逐條核對），建議 14b 以上更穩；7b 為可接受下限。
LLM_MODEL            = "qwen2.5:7b"
OLLAMA_URL           = "http://localhost:11434"
LLM_MAX_CHARS        = 6000     # 審核需看更多內容，給多一點
LLM_RETRIES          = 2        # JSON 解析失敗時的重試次數
AUDIT_PASS_THRESHOLD = 70       # 信心分數 ≥ 此值 → 通過，否則退件


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
        "format": "json",                 # 強制 Ollama 回傳合法 JSON
        "options": {"temperature": 0},
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
    """Parse a confidence score from int/'85'/'85%' → int (0 on failure)."""
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        m = re.search(r"\d+", v)
        if m:
            return int(m.group(0))
    return 0


def _audit_case(case: dict, system_prompt: str) -> dict:
    """回傳精簡審核紀錄（含最終決策/信心分數/原因），保證有結果。"""
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
    else:
        # 兜底：LLM 連線/解析全失敗 → 低分退件並標註需人工複審（不會誤判為通過）
        score  = 0
        reason = "AI 初步審核失敗（本地 LLM 無回應或輸出無法解析），請負責專家人工複審。"

    # 依門檻強制覆寫最終決策，確保與規則一致
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
        pyperclip.copy("")
        return

    try:
        system_prompt = _load_audit_prompt()
    except FileNotFoundError:
        print("❌ 找不到 audit_prompt.md，請確認檔案在同一資料夾")
        return

    print(f"🤖 本地 LLM（{LLM_MODEL}）開始初步審核 {len(cases)} 筆案件…")
    results, n_pass, n_reject = [], 0, 0
    for case in cases:
        print(f"  審核中：{case.get('案件名稱', '')}")
        rec = _audit_case(case, system_prompt)
        results.append(rec)
        if rec["最終決策"] == "通過":
            n_pass += 1
        else:
            n_reject += 1
        print(f"    → {rec['最終決策']}（信心 {rec['AI對於保留案件的信心分數']}）")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=4, ensure_ascii=False)

    pyperclip.copy(json.dumps(results, indent=4, ensure_ascii=False))

    print(f"\n✅ 審核完成：通過 {n_pass} 筆 / 退件 {n_reject} 筆（共 {len(results)} 筆）")
    print(f"💾 已存 merged_output.json，並複製到剪貼簿")
    print("   → 直接執行 pipeline_3.py 寫入資料庫")


if __name__ == "__main__":
    process()
