"""
Pipeline Step 1 — 案件初步分析與分類
═══════════════════════════════════════
輸入：網路資料夾（每個子資料夾 = 一個案件）
輸出：
  - pytollm_output.json  (全部案件)
  - system_defined.json  (系統已自動判定)
  - system_unknown.json  (系統未知，需 LLM 人工判定)
  - 自動將 system_unknown.json 複製到剪貼簿

下一步：將剪貼簿內容貼入 pensieve LLM，
        取得未知案件的判定結果後，複製 LLM 回傳值，
        再執行 pipeline_2.py
"""

import os, json
import pyperclip

# ── 路徑設定 ────────────────────────────────────────────────────────────
INPUT_PATH = r"\\khfs4\4600$\01.Leon Yi\01.FAC2\預算\Leon WBS專案預算簽核系統\預算審核"
WORK_DIR   = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\初步審核"

# ── 系統關鍵字對照表 ──────────────────────────────────────────────────
ENTITY_MAPPING = {
    "水務":    ["SIO2分析儀", "矽分析儀", "生活污水", "污水泵", "沉水馬達", "廢水", "RO", "純水", "加藥", "水管", "水箱", "洗滌塔", "熱泵", "回收水"],
    "空壓":    ["空壓機", "乾燥機", "CDA", "真空機"],
    "空調":    ["冰機", "冰水系統", "PCW", "MAU", "FFU", "空調備援", "冷氣", "冷卻水塔", "冷風機"],
    "電力":    ["電盤", "變壓器", "UPS", "發電機", "高壓配電", "斷路器", "電纜"],
    "消防":    ["消防工程", "消防栓", "偵煙器", "灑水頭", "防火間隔", "防火門"],
    "建管":    ["建置案", "餐廳建置", "辦公室裝修", "庫板", "天花板", "隔間", "室裝"],
    "監控":    ["SCADA系統", "PLC程式", "中控系統", "中央監控", "自動化監測"],
    "AI自動化":["深度學習", "影像辨識系統", "模型訓練", "AI演算法", "機器學習"],
    "Relayout":["機台移位", "機台配置", "佈局調整", "RELAYOUT", "二次配", "拆機", "機台放置"],
}

EXPERT_DB = {
    "設備擴充 (UTI)": {"空調": ["黃金燦"], "空壓": ["郭于斌"], "水務": ["梁益齊"], "抽氣": ["梁益齊"], "電力": ["李明鴻"], "監控": ["王嘉漢"]},
    "工程擴廠 (新工)": {"Relayout": ["陳信舟", "鄭仁勝", "紀志忠"], "二次配": ["陳信舟", "鄭仁勝", "紀志忠"], "空調": ["鄭仁勝"], "水務": ["陳妍方"], "抽氣": ["陳妍方"]},
    "CIM相關":  {"監控": ["王嘉漢"], "AI自動化": ["黃互慶"]},
    "法遵 (ESH)": {"消防": ["吳明華"], "建管": ["吳明華"], "環保": ["姜婷毓"]},
}

BOILERPLATE_NOISE = [
    "Need To Know", "會議機密", "四「不」原則", "不將會議記錄轉寄",
    "公務機密管理規範", "人事規章處理", "雇用合約", "Notes E-Mail",
    "公司之財產", "資安關鍵字", "非我自身公務不過問", "不擅自邀請",
    "不揭露產品功能", "不傳遞信件", "禁止作為私人用途",
]


def extract_text(file_path):
    ext = os.path.splitext(file_path)[-1].lower()
    try:
        if ext == ".pptx":
            from pptx import Presentation
            prs = Presentation(file_path)
            return "\n".join(
                shape.text for slide in prs.slides
                for shape in slide.shapes if hasattr(shape, "text")
            )
        if ext == ".pdf":
            from PyPDF2 import PdfReader
            return "".join(p.extract_text() or "" for p in PdfReader(file_path).pages)
        if ext == ".docx":
            from docx import Document
            return "\n".join(p.text for p in Document(file_path).paragraphs)
        if ext == ".txt":
            with open(file_path, encoding="utf-8") as f:
                return f.read()
    except Exception:
        pass
    return "[注意：此檔案內容提取受限]"


def find_best_system(content, folder_name):
    folder_up  = folder_name.upper()
    content_up = content.upper()
    for noise in BOILERPLATE_NOISE:
        content_up = content_up.replace(noise.upper(), "")

    # 資料夾名稱直接命中 → 採用
    title_hits = [s for s, kws in ENTITY_MAPPING.items()
                  if any(kw.upper() in folder_up for kw in kws)]
    if len(title_hits) == 1:
        return title_hits[0]

    # 關鍵字頻率計分
    scores = {s: sum(content_up.count(kw.upper()) * 5 for kw in kws)
              for s, kws in ENTITY_MAPPING.items()}
    total = sum(scores.values())
    if total < 15:
        return "未知"

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    best, best_score = ranked[0]
    second_score     = ranked[1][1] if len(ranked) > 1 else 0
    if (best_score / total) < 0.70 or ((best_score - second_score) / total) < 0.40:
        return "未知"
    return best


def classify_category(system, folder_and_header):
    if system in ("AI自動化", "監控"):
        return "CIM相關"
    if system in ("消防", "建管"):
        return "法遵 (ESH)"
    if system == "未知":
        return "未知"
    new_keywords = ["修繕", "建置", "新建", "整改", "備援", "RELAYOUT"]
    return "工程擴廠 (新工)" if any(k in folder_and_header for k in new_keywords) else "設備擴充 (UTI)"


def process():
    os.makedirs(WORK_DIR, exist_ok=True)
    folders = [d for d in os.listdir(INPUT_PATH)
               if os.path.isdir(os.path.join(INPUT_PATH, d)) and not d.startswith(".")]

    all_cases = []
    for folder in folders:
        print(f"  分析中：{folder}")
        case_path = os.path.join(INPUT_PATH, folder)
        files     = [f for f in os.listdir(case_path) if not f.startswith("~")]

        inventory = []
        full_text = ""
        for fname in files:
            inventory.append(f"- {fname}")
            ext = os.path.splitext(fname)[1].lower()
            if ext in (".pdf", ".pptx", ".docx", ".txt"):
                extracted = extract_text(os.path.join(case_path, fname))
                full_text += f"\n<<< 檔案名稱: {fname} 開始 >>>\n{extracted}\n<<< 檔案名稱: {fname} 結束 >>>\n"
            else:
                full_text += f"\n<<< 檔案名稱: {fname} (非文字檔) >>>\n"

        system   = find_best_system(full_text, folder)
        header   = (folder + full_text[:1500]).upper()
        category = classify_category(system, header)
        experts  = EXPERT_DB.get(category, {}).get(system, [])

        all_cases.append({
            "案件名稱":            folder,
            "判定系統":            system,
            "判定類別":            category,
            "負責專家":            ", ".join(experts) if experts else "待分配",
            "檔案實體清單":         "\n".join(inventory),
            "所有檔案原文(按檔案分段)": full_text,
        })

    # 存全量
    _save(os.path.join(WORK_DIR, "pytollm_output.json"), all_cases)

    # 分流
    defined = [c for c in all_cases if c["判定系統"] != "未知"]
    unknown = [c for c in all_cases if c["判定系統"] == "未知"]
    _save(os.path.join(WORK_DIR, "system_defined.json"), defined)
    _save(os.path.join(WORK_DIR, "system_unknown.json"), unknown)

    print(f"\n✅ 完成：{len(defined)} 筆已判定 / {len(unknown)} 筆未知")

    if unknown:
        pyperclip.copy(json.dumps(unknown, indent=4, ensure_ascii=False))
        print(f"📋 {len(unknown)} 筆未知案件已複製到剪貼簿")
        print("   → 貼入 pensieve LLM 取得判定，複製回傳結果後執行 pipeline_2.py")
    else:
        print("   → 全部案件已自動判定，可直接執行 pipeline_2.py（剪貼簿留空即可）")


def _save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


if __name__ == "__main__":
    process()
