"""
Pipeline Step 1 — 案件初步分析與分類
═══════════════════════════════════════
輸入：網路資料夾（每個子資料夾 = 一個案件）
輸出：
  - pytollm_output.json  (全部案件)
  - system_defined.json  (系統已自動判定)
  - system_unknown.json  (系統未知)
  - 若 USE_LOCAL_LLM=True：自動呼叫本地 Ollama 補完未知案件，結果複製到剪貼簿
  - 若 USE_LOCAL_LLM=False：將 system_unknown.json 複製到剪貼簿（舊流程）

下一步：執行 pipeline_2.py
        （本地 LLM 模式下無須手動貼上任何內容）
"""

import os, json
import pyperclip

# ── 路徑設定 ────────────────────────────────────────────────────────────
INPUT_PATH = r"\\khfs4\4600$\01.Leon Yi\01.FAC2\預算\Leon WBS專案預算簽核系統\預算審核"
WORK_DIR   = r"D:\ASEKH\K20076\2026\預算AI Agent\新思路0409\初步審核"

# ── 系統關鍵字對照表（依「廠務設備邏輯決策官」白名單 v2）──────────────
# 白名單：水務 / 空壓 / 空調 / 電力 / 安全 / 消防 / 資安 / AI自動化 /
#         抽氣 / Relayout / 二次配 / 建管
# 註：監控已併入「資安」（不再是獨立系統）；二次配無固定關鍵字 — 由衝突
#     解決規則或 LLM 判定（見下方規則）。
ENTITY_MAPPING = {
    "水務":    ["MBR", "廢水", "回收水", "RO", "超純水", "純水", "生活污水", "污水泵", "沉水馬達", "SiO2分析儀", "矽分析儀", "藥槽區", "污泥", "加藥", "水箱", "熱泵(節能水)", "給排水"],
    "空壓":    ["空壓機", "乾燥機", "CDA", "真空", "外熱式乾燥機"],
    "空調":    ["冷卻水塔", "冰水機", "PCW", "MAU", "FFU", "溫濕度", "空調備援", "冷氣", "熱泵(空調系)", "換氣風機"],
    "電力":    ["電盤", "變壓器", "UPS", "發電機", "GCB", "斷路器", "電力主系統", "配電箱", "照明", "變電站"],
    "安全":    ["公危倉", "化學品泄露", "緊急應變", "洗眼器", "防護衣"],
    "消防":    ["防火門", "消防栓", "偵煙器", "廣播系統", "灑水頭", "消防法規", "消防泵"],
    "資安":    ["SCADA", "PLC", "自動化監測", "中控系統", "CCTV", "MOF電錶", "資訊安全", "資安", "網路安全", "防火牆", "弱點掃描", "滲透測試", "入侵偵測", "EDR", "SIEM", "ISO27001", "存取控制", "資安監控", "SOC"],
    "AI自動化":["影像辨識模型", "深度學習", "AI演算法"],
    "抽氣":    ["RRTO", "RTO", "沸石滾輪", "Scrubber", "洗滌塔", "有機排氣", "無機排氣", "排氣管路", "風車", "異味改善", "抽氣馬達"],
    "建管":    ["建置案", "餐廳建置", "老舊建物改善", "園管區", "結構安全", "防水工程"],
    "Relayout":["機台移位", "空間規劃", "隔間拆除", "裝修", "家具配置", "佈局調整"],
}

# ── 衝突解決優先序觸發詞（高 → 低，對應 classification_prompt.md）────────
RELAYOUT_TRIGGERS = ["家具配置", "家具", "隔間", "空間規劃", "空間調整", "空間",
                     "裝修", "拆除", "拆機", "機台進駐", "機台移位", "機台放置",
                     "CLASS增設", "RELAYOUT", "佈局調整", "佈局"]
ERJIPEI_TRIGGER   = "二次配"
JIANGUAN_TRIGGERS = ["法規", "結構安全", "違章"]
GENERIC_PARTS     = ["法蘭", "蝶閥", "管帽"]

# ── 本地 LLM 設定（Ollama）──────────────────────────────────────────────
# USE_LOCAL_LLM = True  → 自動呼叫 Ollama 判定未知案件（免剪貼簿）
# USE_LOCAL_LLM = False → 舊流程：複製到剪貼簿，手動貼入 pensieve
USE_LOCAL_LLM  = True
LLM_MODEL      = "qwen2.5:7b"          # Ollama 已下載的模型名稱
OLLAMA_URL     = "http://localhost:11434"
LLM_MAX_CHARS  = 3000                   # 每案件最多傳給 LLM 的文字長度（節省 token）

LLM_WHITELIST = ["水務", "空壓", "空調", "電力", "安全", "消防", "資安",
                 "AI自動化", "抽氣", "Relayout", "二次配", "建管"]

EXPERT_DB = {
    "設備擴充 (UTI)": {"空調": ["黃金燦"], "空壓": ["郭于斌"], "水務": ["梁益齊"], "抽氣": ["梁益齊"], "電力": ["李明鴻"], "資安": ["王嘉漢"]},
    "工程擴廠 (新工)": {"Relayout": ["陳信舟", "鄭仁勝", "紀志忠"], "二次配": ["陳信舟", "鄭仁勝", "紀志忠"], "空調": ["鄭仁勝"], "水務": ["陳妍方"], "抽氣": ["陳妍方"]},
    "CIM相關":  {"資安": ["王嘉漢"], "AI自動化": ["黃互慶"]},
    "法遵 (ESH)": {"消防": ["吳明華"], "建管": ["吳明華"], "環保": ["姜婷毓"]},
}

BOILERPLATE_NOISE = [
    "Need To Know", "會議機密", "四「不」原則", "不將會議記錄轉寄",
    "公務機密管理規範", "人事規章處理", "雇用合約", "Notes E-Mail",
    "公司之財產", "資安關鍵字", "非我自身公務不過問", "不擅自邀請",
    "不揭露產品功能", "不傳遞信件", "禁止作為私人用途",
]


def _load_system_prompt() -> str:
    """Read classification_prompt.md from same directory."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "classification_prompt.md")
    with open(path, encoding="utf-8") as f:
        return f.read()


def _llm_classify(case: dict, system_prompt: str) -> str:
    """
    Call local Ollama to get system classification for a single unknown case.
    Returns the whitelist category string, or empty string on failure.
    """
    import urllib.request
    import urllib.error

    content_snippet = case.get("所有檔案原文(按檔案分段)", "")[:LLM_MAX_CHARS]
    user_msg = (
        f"案件名稱：{case['案件名稱']}\n"
        f"檔案清單：\n{case.get('檔案實體清單', '')}\n\n"
        f"文件內容（節錄）：\n{content_snippet}"
    )

    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_msg},
        ],
        "stream": False,
        "options": {"temperature": 0},
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read())
        raw = result["message"]["content"].strip()
        # Strip any punctuation/brackets the model may add
        cleaned = raw.strip("【】「」《》()（）.。,，\n\r\t ").split()[0] if raw else ""
        return cleaned
    except urllib.error.URLError:
        print(f"    ⚠️  無法連線 Ollama（{OLLAMA_URL}）— 請確認 Ollama 已啟動且模型已下載")
        return ""
    except Exception as e:
        print(f"    ⚠️  LLM 呼叫失敗：{e}")
        return ""


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


def _systems_in_text(text_up):
    """回傳 {系統: 關鍵字最後出現位置}，供「名稱含多系統取後者」判斷使用。"""
    found = {}
    for sys, kws in ENTITY_MAPPING.items():
        pos = max((text_up.rfind(kw.upper()) for kw in kws), default=-1)
        if pos >= 0:
            found[sys] = pos
    return found


def find_best_system(content, folder_name):
    """依「廠務設備邏輯決策官」衝突解決優先序判斷唯一系統；無法判定回傳「未知」。"""
    raw_name = folder_name or ""
    raw_all  = f"{folder_name} {content}"
    name_up  = raw_name.upper()
    text_up  = raw_all.upper()
    for noise in BOILERPLATE_NOISE:
        text_up = text_up.replace(noise.upper(), "")

    # 1) Relayout 最高優先：空間/裝修/家具/拆除/機台進駐 …
    if any(t.upper() in text_up for t in RELAYOUT_TRIGGERS):
        return "Relayout"

    # 2) 二次配 次高優先
    if ERJIPEI_TRIGGER in raw_all:
        return "二次配"

    # 3) 建管：僅限法規 / 結構安全 / 違章
    if any(t in raw_all for t in JIANGUAN_TRIGGERS):
        return "建管"

    # 6) 專案名稱含二個系統 → 以後者（出現位置較後）為準
    name_systems = _systems_in_text(name_up)
    if len(name_systems) >= 2:
        return max(name_systems, key=name_systems.get)

    # 關鍵字頻率計分
    scores  = {s: sum(text_up.count(kw.upper()) for kw in kws)
               for s, kws in ENTITY_MAPPING.items()}
    nonzero = {s: sc for s, sc in scores.items() if sc > 0}

    # 4) 通用組件（法蘭/蝶閥/管帽）且無明確主體 → Relayout
    if not nonzero and any(g in raw_all for g in GENERIC_PARTS):
        return "Relayout"

    if not nonzero:
        # 名稱命中單一系統也採用
        if len(name_systems) == 1:
            return next(iter(name_systems))
        return "未知"

    # 5) 多系統且含 Relayout → Relayout
    if len(nonzero) >= 2 and "Relayout" in nonzero:
        return "Relayout"

    ranked = sorted(nonzero.items(), key=lambda x: x[1], reverse=True)
    best, best_score = ranked[0]
    second_score     = ranked[1][1] if len(ranked) > 1 else 0

    # 7) 多系統分數相同無法分辨 → 交給 LLM（依各系統預算金額最高者判定）
    if second_score == best_score:
        return "未知"
    return best


def classify_category(system, folder_and_header):
    # CIM 相關：資安（含原監控）/ AI自動化
    if system in ("AI自動化", "資安"):
        return "CIM相關"
    # 法遵 (ESH)：消防 / 建管 / 安全
    if system in ("消防", "建管", "安全"):
        return "法遵 (ESH)"
    # 工程擴廠 (新工)：二次配 / Relayout 一律歸新工
    if system in ("二次配", "Relayout"):
        return "工程擴廠 (新工)"
    if system == "未知":
        return "未知"
    # 其餘設備系統：依關鍵字判斷新建工程或既有設備擴充
    new_keywords = ["修繕", "建置", "新建", "整改", "備援", "RELAYOUT", "擴建", "新增"]
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
        if USE_LOCAL_LLM:
            print(f"\n🤖 啟用本地 LLM（{LLM_MODEL}），開始自動補完 {len(unknown)} 筆未知案件…")
            try:
                system_prompt = _load_system_prompt()
            except FileNotFoundError:
                print("❌ 找不到 classification_prompt.md，請確認檔案在同一資料夾")
                system_prompt = None

            resolved, still_unknown = [], []

            if system_prompt:
                for case in unknown:
                    print(f"  分類中：{case['案件名稱']}")
                    sys_result = _llm_classify(case, system_prompt)

                    if sys_result in LLM_WHITELIST:
                        case["判定系統"] = sys_result
                        folder_header = (
                            case["案件名稱"]
                            + case.get("所有檔案原文(按檔案分段)", "")[:1500]
                        ).upper()
                        case["判定類別"] = classify_category(sys_result, folder_header)
                        experts = EXPERT_DB.get(case["判定類別"], {}).get(sys_result, [])
                        case["負責專家"] = ", ".join(experts) if experts else "待分配"
                        resolved.append(case)
                        print(f"    → ✅ {sys_result} / {case['判定類別']}")
                    else:
                        still_unknown.append(case)
                        if sys_result:
                            print(f"    → ⚠️  無效回應「{sys_result}」，保留為未知")
                        else:
                            print(f"    → ⚠️  LLM 無回應，保留為未知")
            else:
                still_unknown = unknown

            # 更新 system_unknown.json（只保留仍未知的案件）
            _save(os.path.join(WORK_DIR, "system_unknown.json"), still_unknown)

            if resolved:
                # 將 LLM 補完的案件複製到剪貼簿（pipeline_2 直接讀取，無須手動貼上）
                pyperclip.copy(json.dumps(resolved, indent=4, ensure_ascii=False))
                print(f"\n✅ LLM 自動補完 {len(resolved)} 筆 / 仍未知 {len(still_unknown)} 筆")
                print("📋 已複製到剪貼簿，請執行 pipeline_2.py")
            else:
                pyperclip.copy("")
                print(f"\n⚠️  LLM 全部判定失敗，{len(still_unknown)} 筆仍為未知")
                print("   → 請改用手動流程：貼入 pensieve LLM 後執行 pipeline_2.py")

            if still_unknown:
                print(f"   ⚠️  仍未知案件已更新至 system_unknown.json，可手動補判後再執行 pipeline_2.py")
        else:
            # 舊剪貼簿流程
            pyperclip.copy(json.dumps(unknown, indent=4, ensure_ascii=False))
            print(f"📋 {len(unknown)} 筆未知案件已複製到剪貼簿")
            print("   → 以 classification_prompt.md 為系統提示，貼入 pensieve LLM 取得判定，")
            print("     複製回傳結果後執行 pipeline_2.py")
    else:
        print("   → 全部案件已自動判定，可直接執行 pipeline_2.py（剪貼簿留空即可）")


def _save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


if __name__ == "__main__":
    process()
