/* Mock data for AI Agent 預算審核平台 */

const CATEGORIES = [
  { id: "RD", name: "研發費用", sub: ["原型開發", "材料採購", "外部委託"] },
  { id: "MKT", name: "行銷推廣", sub: ["品牌活動", "數位廣告", "通路經營"] },
  { id: "OPS", name: "營運支援", sub: ["設備維護", "辦公耗材", "差旅費用"] },
  { id: "HR", name: "人力資源", sub: ["招募費用", "教育訓練", "員工福利"] },
  { id: "IT", name: "資訊系統", sub: ["軟體授權", "雲端服務", "資安建置"] },
];

const OWNERS = [
  { id: "U001", name: "陳建宏", dept: "研發處", initial: "陳" },
  { id: "U002", name: "林淑芬", dept: "行銷部", initial: "林" },
  { id: "U003", name: "黃志明", dept: "資訊處", initial: "黃" },
  { id: "U004", name: "張雅婷", dept: "人資部", initial: "張" },
  { id: "U005", name: "王俊傑", dept: "營運處", initial: "王" },
  { id: "U006", name: "李怡君", dept: "研發處", initial: "李" },
  { id: "U007", name: "吳明達", dept: "行銷部", initial: "吳" },
  { id: "U008", name: "蔡心怡", dept: "資訊處", initial: "蔡" },
];

const PROJECTS = [
  { name: "Q2 智能客服平台升級", cat: "IT", sub: "軟體授權", owner: 2, amt: 1_240_000 },
  { name: "東南亞市場品牌曝光", cat: "MKT", sub: "數位廣告", owner: 1, amt: 880_000 },
  { name: "AI 模型訓練 GPU 採購", cat: "IT", sub: "雲端服務", owner: 2, amt: 3_650_000 },
  { name: "新版產品原型樣機", cat: "RD", sub: "原型開發", owner: 0, amt: 540_000 },
  { name: "全員資安教育訓練", cat: "HR", sub: "教育訓練", owner: 3, amt: 220_000 },
  { name: "倉儲自動化設備保養", cat: "OPS", sub: "設備維護", owner: 4, amt: 410_000 },
  { name: "供應鏈管理系統導入", cat: "IT", sub: "軟體授權", owner: 7, amt: 2_180_000 },
  { name: "技術主管招募費", cat: "HR", sub: "招募費用", owner: 3, amt: 380_000 },
  { name: "晶圓檢測材料採購", cat: "RD", sub: "材料採購", owner: 5, amt: 1_750_000 },
  { name: "年度品牌大會活動", cat: "MKT", sub: "品牌活動", owner: 6, amt: 980_000 },
  { name: "客戶滿意度調查委外", cat: "MKT", sub: "通路經營", owner: 1, amt: 165_000 },
  { name: "ERP 模組擴充", cat: "IT", sub: "軟體授權", owner: 2, amt: 720_000 },
  { name: "辦公耗材集中採購 Q2", cat: "OPS", sub: "辦公耗材", owner: 4, amt: 95_000 },
  { name: "海外技術交流差旅", cat: "OPS", sub: "差旅費用", owner: 0, amt: 280_000 },
  { name: "資安監控平台建置", cat: "IT", sub: "資安建置", owner: 7, amt: 1_420_000 },
  { name: "AI Agent 評測委外", cat: "RD", sub: "外部委託", owner: 5, amt: 660_000 },
  { name: "員工健康檢查方案", cat: "HR", sub: "員工福利", owner: 3, amt: 340_000 },
  { name: "Q3 旗艦店通路擴張", cat: "MKT", sub: "通路經營", owner: 6, amt: 1_580_000 },
];

const AI_REASONS = {
  approve: [
    "金額符合該類別歷史中位數範圍 (±18%)，供應商已通過 Tier-1 資格驗證，預算單號編列無重複，建議放行。",
    "細項拆分合理，單價對比市場均價偏低約 6%，採購流程文件齊備，符合內控規範。",
    "案件屬週期性既定支出，過去四季同性質案件平均週期 2.3 天，建議快速通道。",
    "本筆與本年度策略目標 OBJ-2026-A3 對齊度高，ROI 預估值 1.42，財務影響在容忍範圍。",
  ],
  reject: [
    "金額偏離該類別中位數 +212%，供應商於近半年內出現 2 件履約異常紀錄，建議專家複審。",
    "預算編列項目與業務說明不一致，缺少採購比價單據，未符合 P-005 採購規範第 3.2 條。",
    "本案與既有預算單號 BG-2026-W18-0042 存在重複嫌疑，建議駁回並請申請人重新整併。",
  ],
  hold: [
    "AI 信心度低於門檻 (60%)，無法判定，請專家依附件補充資料審核。",
    "案件涉及跨部門共同分攤，需專家確認分攤比例後再做最終判定。",
  ],
};

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
function fmtDateShort(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function weekOf(d) {
  // ISO week number
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
}

function generateBudgets() {
  const r = rand(42);
  const items = [];
  const now = new Date("2026-05-21T10:00:00");

  PROJECTS.forEach((p, idx) => {
    // dispatch date: random offset within the last 60 days
    const offDays = Math.floor(r() * 60);
    const dispatch = new Date(now);
    dispatch.setDate(dispatch.getDate() - offDays);
    dispatch.setHours(Math.floor(r() * 9) + 9, Math.floor(r() * 60));

    // Decide AI result
    const roll = r();
    let aiResult, aiReason, conf;
    if (roll < 0.55) {
      aiResult = "approve";
      conf = 0.78 + r() * 0.2;
      aiReason = AI_REASONS.approve[Math.floor(r() * AI_REASONS.approve.length)];
    } else if (roll < 0.8) {
      aiResult = "reject";
      conf = 0.62 + r() * 0.3;
      aiReason = AI_REASONS.reject[Math.floor(r() * AI_REASONS.reject.length)];
    } else {
      aiResult = "hold";
      conf = 0.3 + r() * 0.25;
      aiReason = AI_REASONS.hold[Math.floor(r() * AI_REASONS.hold.length)];
    }

    // Expert decision and sign date
    const expertRoll = r();
    let expertResult = null, signDate = null, status, expertComment = "";
    const isOlder = offDays > 10;
    if (isOlder) {
      // completed
      if (aiResult === "approve" && expertRoll < 0.92) {
        expertResult = "approve";
        expertComment = "AI 判斷理由充分，已比對相關歷史案件，同意核可。";
      } else if (aiResult === "reject" && expertRoll < 0.75) {
        expertResult = "reject";
        expertComment = "經查核相關文件後，確認 AI 標示之風險屬實，建議退回申請單位重新檢視預算編列。";
      } else if (aiResult === "hold") {
        expertResult = expertRoll < 0.6 ? "approve" : "reject";
        expertComment = expertResult === "approve"
          ? "已補件並確認分攤比例正確，予以核可。"
          : "補件資料仍不足，需重新申請。";
      } else {
        // Override
        expertResult = aiResult === "approve" ? "reject" : "approve";
        expertComment = "經面談負責人後，認為 AI 判斷需修正，依實際情況做出反向決議。";
      }
      const sign = new Date(dispatch);
      sign.setHours(sign.getHours() + Math.floor(r() * 60) + 4);
      signDate = sign;
      status = expertResult === "approve" ? "approved" : "rejected";
    } else if (offDays > 1) {
      // pending expert
      status = "in_review";
    } else {
      status = "new";
    }

    const wk = weekOf(dispatch);
    const num = String(idx + 1).padStart(4, "0");

    items.push({
      id: `BG-2026-W${wk}-${num}`,
      week: wk,
      project: p.name,
      category: CATEGORIES.find((c) => c.id === p.cat).name,
      categoryId: p.cat,
      subCategory: p.sub,
      owner: OWNERS[p.owner],
      amount: p.amt,
      aiResult,
      aiReason,
      aiConfidence: Math.round(conf * 100),
      expertResult,
      expertComment,
      status,
      dispatchDate: dispatch,
      signDate,
      notes: idx === 2
        ? "本案涉及跨年度規劃，請審核時注意分期撥款條件。"
        : idx === 6
        ? "已附比價單三份，主供應商為去年合作廠商。"
        : "",
    });
  });

  // Sort newest first
  items.sort((a, b) => b.dispatchDate - a.dispatchDate);
  return items;
}

function cycleTime(disp, sign) {
  if (!sign) return null;
  const ms = sign - disp;
  const hrs = ms / 3600000;
  if (hrs < 24) return { hrs, label: `${hrs.toFixed(1)}h`, fast: hrs < 6 };
  const days = hrs / 24;
  return { hrs, label: `${days.toFixed(1)}d`, slow: days > 3 };
}

function nextDispatchNo(items) {
  const now = new Date();
  const wk = weekOf(now);
  const used = items.filter((i) => i.week === wk).length;
  return `BG-2026-W${wk}-${String(items.length + 1).padStart(4, "0")}`;
}

const SAMPLE_AI_JSON = {
  decision: "approve",
  confidence: 0.91,
  reason: "金額符合該類別歷史中位數範圍 (±12%)，供應商為已備案之 Tier-1 廠商，採購比價文件齊備，建議放行。",
  policy_refs: ["P-005 §3.2", "BUDGET-Q2-LIMITS"],
  risk_flags: [],
  model: "budget-screener-v3.2.1",
  ts: "2026-05-21T09:42:11+08:00",
};

const AGENTS = [
  { id: "BSV", name: "Budget Screener", desc: "金額異常偵測、供應商風險查核、與歷史案件相似度比對。", ver: "v3.2.1", calls: "12,840", acc: "94.2%" },
  { id: "DUP", name: "Duplicate Detector", desc: "跨週、跨部門預算單號重複偵測，含語意層級比對。", ver: "v1.4.0", calls: "8,210", acc: "97.8%" },
  { id: "PLC", name: "Policy Compliance", desc: "依照採購規範 P-005 / P-012 自動檢核必要文件齊備性。", ver: "v2.0.3", calls: "9,640", acc: "92.5%" },
  { id: "OBJ", name: "Strategic Alignment", desc: "比對年度策略目標 OBJ-2026-Ax，產出對齊度評分與 ROI 預估。", ver: "v0.9.2", calls: "3,180", acc: "—" },
  { id: "VND", name: "Vendor Risk", desc: "供應商履約紀錄、財務體質與市場聲量風險評估。", ver: "v2.7.1", calls: "5,720", acc: "89.3%" },
  { id: "SUM", name: "Case Summarizer", desc: "彙整審核紀錄與後續行動，輸出主管簽核摘要。", ver: "v1.1.0", calls: "2,440", acc: "—" },
];

const ROLES = [
  { id: "admin", name: "系統管理員", desc: "完整權限，含使用者與權限設定", count: 2 },
  { id: "expert", name: "專家複審", desc: "可審核 AI 派發案件、調整審核處置", count: 8 },
  { id: "owner", name: "預算負責人", desc: "可建立預算單、查看自身相關案件", count: 24 },
  { id: "viewer", name: "檢視者", desc: "唯讀，僅可瀏覽已核可案件", count: 6 },
];

window.MOCK = {
  CATEGORIES, OWNERS, PROJECTS, AGENTS, ROLES,
  SAMPLE_AI_JSON,
  generateBudgets, fmtDate, fmtDateShort, weekOf, cycleTime, nextDispatchNo,
};
