"""
Pipeline Step 3 — 儲存 AI 審核結果並寫入資料庫
══════════════════════════════════════════════════
前置：將 pensieve LLM 的 AI 審核結果（含最終決策/原因/信心分數）複製到剪貼簿
輸入：剪貼簿
輸出：budget.json + 自動寫入 DB
"""

import json, os, re, sys
import pyperclip

BUDGET_JSON = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\系統flask\新增資料夾\pensieve回傳資料\budget.json"


def parse_clipboard():
    """從剪貼簿取得 JSON，支援多種 LLM 輸出格式。"""
    raw = pyperclip.paste().strip()
    if not raw:
        return None

    raw = re.sub(r"【.*?】", "", raw).strip()
    raw = re.sub(r"```(?:json)?", "", raw).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # 貪婪抓取最外層陣列或物件（修正原本 {.*?} 非貪婪的 bug）
    match = re.search(r"(\[.*\]|\{.*\})", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    return None


def run_ingest():
    """呼叫 rpa/ingest.py 將 budget.json 寫入 DB。"""
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    ingest_path = os.path.join(script_dir, "..", "rpa", "ingest.py")
    if not os.path.exists(ingest_path):
        print(f"⚠️  找不到 ingest.py：{ingest_path}")
        return
    import subprocess
    result = subprocess.run([sys.executable, ingest_path])
    if result.returncode != 0:
        print("⚠️  ingest.py 執行異常，請手動檢查。")


def process():
    data = parse_clipboard()
    if data is None:
        print("❌ 剪貼簿沒有有效的 JSON，請確認已複製 pensieve LLM 的回傳結果。")
        return

    # 確保目標資料夾存在
    os.makedirs(os.path.dirname(BUDGET_JSON), exist_ok=True)

    with open(BUDGET_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    count = len(data) if isinstance(data, list) else 1
    print(f"💾 budget.json 已儲存（{count} 筆）→ {BUDGET_JSON}")
    print("🚀 開始寫入資料庫...")
    run_ingest()
    print("✅ 全部完成！請重新整理平台頁面查看新案件。")


if __name__ == "__main__":
    process()
