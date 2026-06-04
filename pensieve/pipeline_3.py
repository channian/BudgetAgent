"""
Pipeline Step 3 — 儲存 AI 審核結果至 budget.json
══════════════════════════════════════════════════
前置：將 pensieve LLM 的 AI 審核結果（含最終決策/原因/信心分數）複製到剪貼簿
輸入：剪貼簿
輸出：budget.json

下一步：執行 rpa/ingest.py 將 budget.json 寫入 DB
"""

import json, os, re
import pyperclip

BUDGET_JSON = r"D:\AS\2026\預算AI Agent\新思路0409\系統flask\A1初步預算\budget.json"


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

    # 貪婪抓取最外層陣列或物件
    match = re.search(r"(\[.*\]|\{.*\})", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    return None


def process():
    data = parse_clipboard()
    if data is None:
        print("❌ 剪貼簿沒有有效的 JSON，請確認已複製 pensieve LLM 的回傳結果。")
        return

    os.makedirs(os.path.dirname(BUDGET_JSON), exist_ok=True)

    with open(BUDGET_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    count = len(data) if isinstance(data, list) else 1
    print(f"💾 budget.json 已儲存（{count} 筆）→ {BUDGET_JSON}")
    print("✅ 完成！請執行 ingest.py 將資料寫入 DB。")


if __name__ == "__main__":
    process()
