"""
Pipeline Step 2 — 合併 LLM 補充判定結果
═══════════════════════════════════════════
前置：將 pensieve LLM 回傳的未知案件判定結果複製到剪貼簿
      （若 pipeline_1 沒有未知案件，剪貼簿可留空）
輸入：剪貼簿 + system_defined.json
輸出：merged_output.json + 自動複製到剪貼簿

下一步：將剪貼簿內容貼入 pensieve LLM 進行 AI 審核（最終決策/原因/信心分數），
        複製 LLM 回傳結果後執行 pipeline_3.py
"""

import json, os, re
import pyperclip

WORK_DIR = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\初步審核"


def parse_clipboard():
    """從剪貼簿取得 JSON，支援多種 LLM 輸出格式。"""
    raw = pyperclip.paste().strip()
    if not raw:
        return None

    # 移除 LLM 常見前綴標題（如 【結果】、```json 等）
    raw = re.sub(r"【.*?】", "", raw).strip()
    raw = re.sub(r"```(?:json)?", "", raw).strip()

    # 嘗試直接解析
    for attempt in (raw,):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            pass

    # 抓取最外層 [...] 或 {...}
    match = re.search(r"(\[.*\]|\{.*\})", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    return None


def process():
    defined_path = os.path.join(WORK_DIR, "system_defined.json")
    output_path  = os.path.join(WORK_DIR, "merged_output.json")

    if not os.path.exists(defined_path):
        print(f"❌ 找不到 {defined_path}，請先執行 pipeline_1.py")
        return

    with open(defined_path, encoding="utf-8") as f:
        defined = json.load(f)

    clipboard_data = parse_clipboard()

    if clipboard_data is None:
        # 剪貼簿為空或解析失敗 → 直接用 defined 繼續
        print("⚠️  剪貼簿無有效 JSON（未知案件為零或尚未貼上），僅使用已判定案件繼續。")
        merged = defined
    elif isinstance(clipboard_data, list):
        merged = defined + clipboard_data
        print(f"✅ 合併完成：{len(defined)} 已判定 + {len(clipboard_data)} LLM 補充 = {len(merged)} 筆")
    elif isinstance(clipboard_data, dict):
        merged = defined + [clipboard_data]
        print(f"✅ 合併完成：{len(defined)} 已判定 + 1 LLM 補充 = {len(merged)} 筆")
    else:
        print("⚠️  剪貼簿格式無法識別，僅使用已判定案件繼續。")
        merged = defined

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=4, ensure_ascii=False)

    result_str = json.dumps(merged, indent=4, ensure_ascii=False)
    pyperclip.copy(result_str)

    print(f"💾 已儲存 merged_output.json（{len(merged)} 筆）")
    print("📋 已複製到剪貼簿")
    print("   → 貼入 pensieve LLM 進行 AI 審核，複製回傳結果後執行 pipeline_3.py")


if __name__ == "__main__":
    process()
