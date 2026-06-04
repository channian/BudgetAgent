/* API client + data mapper
 * Bridges the Flask backend (DB schema v2.0) and the React frontend.
 */

// 空字串 = 與前端同源（Flask 直接 serve），可用 window.API_BASE 覆寫
const API_BASE = window.API_BASE !== undefined ? window.API_BASE : "";

// ── Clipboard helper ──────────────────────────────────────────────────
// navigator.clipboard 只在 HTTPS / localhost（secure context）可用；
// 內網以 http://10.x 連線時會是 undefined，需退回 execCommand。
// 回傳 Promise，方便呼叫端 .then()/.catch()。
function copyToClipboard(text) {
  const value = text == null ? "" : String(text);

  // 1) 優先使用現代 API（secure context）
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(value);
  }

  // 2) 退回 execCommand：建立隱藏 textarea、選取、複製
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      // 避免捲動跳動、避免被當成表單元素送出
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.width = "1px";
      ta.style.height = "1px";
      ta.style.padding = "0";
      ta.style.border = "none";
      ta.style.outline = "none";
      ta.style.boxShadow = "none";
      ta.style.background = "transparent";
      ta.style.opacity = "0";
      document.body.appendChild(ta);

      ta.focus();
      ta.select();
      ta.setSelectionRange(0, value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("execCommand copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}
window.copyToClipboard = copyToClipboard;

// ── Category name ↔ frontend colour ID ───────────────────────────────
const CAT_NAME_TO_ID = {
  "研發費用": "RD",
  "行銷推廣": "MKT",
  "營運支援": "OPS",
  "人力資源": "HR",
  "資訊系統": "IT",
};

// ── ai_result JSON helpers ────────────────────────────────────────────
// JSONB columns come back from psycopg2 as objects, not strings
function parseAiResult(val) {
  if (!val) return { result: "hold", confidence: 0 };
  const obj = (typeof val === "string")
    ? (() => { try { return JSON.parse(val); } catch { return {}; } })()
    : val;
  const dec  = obj["AI處置結果"];
  const conf = obj["保留案件的信心分數"] ?? 0;
  const result = dec === "通過" ? "approve" : dec === "退件" ? "reject" : "hold";
  return { result, confidence: conf };
}

// Supports both English keys (demo sample) and Chinese keys (real RPA JSON)
function mapAiJsonPaste(j) {
  if (!j || typeof j !== "object") return {};

  // English keys: { decision, confidence, reason }
  if ("decision" in j) {
    return {
      aiResult:     j.decision === "approve" ? "approve"
                  : j.decision === "reject"  ? "reject" : "hold",
      aiConfidence: Math.round((j.confidence || 0) * 100),
      aiReason:     j.reason || "",
    };
  }

  // Chinese keys (RPA): { 最終決策, AI對於保留案件的信心分數, 原因, ... }
  if ("最終決策" in j) {
    const dec = j["最終決策"];
    return {
      // full project fields
      project:     j["案件名稱"]  || "",
      categoryName: j["判定類別"] || "",
      subCategory: j["判定系統"]  || "",
      expertName:  j["負責專家"]  || "",
      // AI fields
      aiResult:     dec === "通過" ? "approve" : dec === "退件" ? "reject" : "hold",
      aiConfidence: j["AI對於保留案件的信心分數"] ?? 0,
      aiReason:     j["原因"] || "",
    };
  }

  return {};
}

// ── DB row → frontend object ──────────────────────────────────────────
function dbToFrontend(row) {
  const ai           = parseAiResult(row.ai_result);
  const expertResult = row.expert_decision === "通過" ? "approve"
                     : row.expert_decision === "退件" ? "reject" : null;
  const ownerName    = row.owner || "";   // plain text column

  return {
    dbId:          row.id,
    id:            row.budget_no || `#${row.id}`,
    budgetNo:      row.budget_no,
    week:          row.week,
    project:       row.project_name,
    category:      row.category,
    categoryId:    CAT_NAME_TO_ID[row.category] || "IT",
    subCategory:   row.sub_category,
    expertName:    row.expert_name,
    owner:         { name: ownerName, dept: "", initial: ownerName.charAt(0) || "?" },
    amount:        parseFloat(row.amount) || 0,
    aiResult:      ai.result,
    aiConfidence:  ai.confidence,
    aiReason:      row.ai_comment || "",
    expertResult,
    expertComment: row.expert_comment || "",
    status:        row.status,
    dispatchDate:  row.dispatch_date ? new Date(row.dispatch_date) : new Date(),
    signDate:      row.sign_date ? new Date(row.sign_date) : null,
    cycleTime:     row.cycle_time,
    notes:         row.note || "",
    updatedAt:     row.dispatch_date ? new Date(row.dispatch_date) : null,
  };
}

// ── Frontend form → DB payload ────────────────────────────────────────
function frontendToDB(form) {
  let ai_result_obj = null;
  if (form.aiResult && form.aiResult !== "hold") {
    ai_result_obj = {
      "AI處置結果":       form.aiResult === "approve" ? "通過" : "退件",
      "保留案件的信心分數": form.aiConfidence ?? 0,
    };
  }

  const expert_decision = form.expertResult === "approve" ? "通過"
                        : form.expertResult === "reject"  ? "退件" : null;

  return {
    project_name: form.project,
    category:     form.category || null,     // free text
    sub_category: form.subCategory || null,
    expert_name:  form.expertName  || null,
    owner:        form.owner || null,        // free text
    amount:       parseFloat(String(form.amount || 0).replace(/,/g, "").replace(/NT\$/g, "").trim()) || 0,
    ai_comment:   form.aiReason || null,
    ai_result_obj,
    expert_comment: form.expertComment || null,
    expert_decision,
    note:         form.notes    || null,
  };
}

// ── HTTP helper ───────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ── Auth ──────────────────────────────────────────────────────────────
async function apiLogin(username, password) {
  const d = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return d.user;
}
async function apiLogout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
}
async function apiMe() {
  const d = await apiFetch("/api/auth/me");
  return d.user;
}
async function apiChangeMyPassword(newPassword) {
  await apiFetch("/api/auth/me/password", {
    method: "PUT",
    body: JSON.stringify({ password: newPassword }),
  });
}

// ── Budgets ───────────────────────────────────────────────────────────
async function apiFetchBudgets(scope = "pending", filters = {}) {
  const params = new URLSearchParams({ scope, ...filters });
  const d = await apiFetch(`/api/budgets?${params}`);
  return (d.budgets || []).map(dbToFrontend);
}
async function apiFetchBudget(dbId) {
  const d = await apiFetch(`/api/budgets/${dbId}`);
  return dbToFrontend(d.budget);
}
async function apiCreateBudget(form) {
  return apiFetch("/api/budgets", { method: "POST", body: JSON.stringify(frontendToDB(form)) });
}
async function apiUpdateBudget(dbId, form) {
  const d = await apiFetch(`/api/budgets/${dbId}`, { method: "PUT", body: JSON.stringify(frontendToDB(form)) });
  return dbToFrontend(d.budget);
}
async function apiApproveBudget(dbId, comment) {
  const d = await apiFetch(`/api/budgets/${dbId}/approve`, { method: "POST", body: JSON.stringify({ comment }) });
  return dbToFrontend(d.budget);
}
async function apiRejectBudget(dbId, comment, final = false) {
  const d = await apiFetch(`/api/budgets/${dbId}/reject`, { method: "POST", body: JSON.stringify({ comment, final }) });
  return dbToFrontend(d.budget);
}
async function apiDeleteBudget(dbId, reason) {
  await apiFetch(`/api/budgets/${dbId}`, { method: "DELETE", body: JSON.stringify({ reason }) });
}
async function apiResubmitBudget(dbId) {
  const d = await apiFetch(`/api/budgets/${dbId}/resubmit`, { method: "POST" });
  return dbToFrontend(d.budget);
}
async function apiSaveReview(dbId, { comment, decision }) {
  const d = await apiFetch(`/api/budgets/${dbId}/review`, {
    method: "POST",
    body: JSON.stringify({ comment, decision }),
  });
  return dbToFrontend(d.budget);
}
async function apiDispatchBudget(dbId, form) {
  const d = await apiFetch(`/api/budgets/${dbId}/dispatch`, {
    method: "POST",
    body: JSON.stringify({
      budget_no:   form.budget_no   || null,
      expert_name: form.expert_name || null,
    }),
  });
  return { budget: dbToFrontend(d.budget), emailStatus: d.email_status };
}
async function apiFetchTimeline(dbId) {
  const d = await apiFetch(`/api/budgets/${dbId}/timeline`);
  return d.timeline || [];
}
async function apiAcquireLock(dbId) {
  return apiFetch(`/api/budgets/${dbId}/lock`, { method: "POST" });
}
async function apiReleaseLock(dbId) {
  return apiFetch(`/api/budgets/${dbId}/lock`, { method: "DELETE" });
}

// ── Users ─────────────────────────────────────────────────────────────
async function apiFetchUsers() {
  const d = await apiFetch("/api/users");
  return d.users || [];
}
async function apiCreateUser(form) {
  const d = await apiFetch("/api/users", { method: "POST", body: JSON.stringify(form) });
  return d;
}
async function apiUpdateUser(id, form) {
  const d = await apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(form) });
  return d.user;
}
async function apiResetPassword(id, password) {
  await apiFetch(`/api/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) });
}

// ── Export / Import ───────────────────────────────────────────────────
// Triggers a browser file download for the given scope + format (csv|xlsx)
async function apiExportBudgets(scope = "pending", format = "csv") {
  const res = await fetch(`${API_BASE}/api/budgets/export?scope=${scope}&format=${format}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const cd   = res.headers.get("Content-Disposition") || "";
  const m    = cd.match(/filename="?([^"]+)"?/);
  const fname = m ? m[1] : `budget_${scope}.${format}`;
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Uploads a CSV/XLSX file; returns { inserted, skipped, errors }
async function apiImportBudgets(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/api/budgets/import`, {
    method: "POST",
    credentials: "include",
    body: fd,   // let the browser set multipart boundary
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ── AI Library (RAG systems + entries) ───────────────────────────────
async function apiFetchRagSystems() {
  const d = await apiFetch("/api/rag/systems");
  return d.systems || [];
}
async function apiCreateRagSystem(form) {
  const d = await apiFetch("/api/rag/systems", { method: "POST", body: JSON.stringify(form) });
  return d.system;
}
async function apiUpdateRagSystem(id, form) {
  const d = await apiFetch(`/api/rag/systems/${id}`, { method: "PUT", body: JSON.stringify(form) });
  return d.system;
}
async function apiDeleteRagSystem(id) {
  await apiFetch(`/api/rag/systems/${id}`, { method: "DELETE" });
}
async function apiFetchRagEntries(sysId, filters = {}) {
  const clean = {};
  Object.entries(filters).forEach(([k, v]) => { if (v) clean[k] = v; });
  const params = new URLSearchParams(clean);
  const d = await apiFetch(`/api/rag/systems/${sysId}/entries?${params}`);
  return d.entries || [];
}
async function apiCreateRagEntry(sysId, form) {
  const d = await apiFetch(`/api/rag/systems/${sysId}/entries`, { method: "POST", body: JSON.stringify(form) });
  return d.entry;
}
async function apiUpdateRagEntry(entryId, form) {
  const d = await apiFetch(`/api/rag/entries/${entryId}`, { method: "PUT", body: JSON.stringify(form) });
  return d.entry;
}
async function apiDeleteRagEntry(entryId) {
  await apiFetch(`/api/rag/entries/${entryId}`, { method: "DELETE" });
}

// ── HR employee lookup (admin only) ──────────────────────────────────
async function apiLookupEmployee(empno) {
  return apiFetch(`/api/auth/lookup_employee?empno=${encodeURIComponent(empno)}`);
}

// ── Login stats (admin only) ──────────────────────────────────────────
async function apiFetchLoginStats() {
  return apiFetch("/api/auth/stats/logins");
}

// ── Notifications ─────────────────────────────────────────────────────
async function apiFetchNotifications() {
  const d = await apiFetch("/api/notifications");
  return d.notifications || [];
}
async function apiMarkNotificationRead(id) {
  await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" });
}

window.API = {
  login:               apiLogin,
  logout:              apiLogout,
  me:                  apiMe,
  changeMyPassword:    apiChangeMyPassword,
  fetchBudgets:        apiFetchBudgets,
  fetchBudget:         apiFetchBudget,
  createBudget:        apiCreateBudget,
  updateBudget:        apiUpdateBudget,
  approve:             apiApproveBudget,
  reject:              apiRejectBudget,
  deleteBudget:        apiDeleteBudget,
  resubmit:            apiResubmitBudget,
  saveReview:          apiSaveReview,
  dispatch:            apiDispatchBudget,
  fetchTimeline:       apiFetchTimeline,
  acquireLock:         apiAcquireLock,
  releaseLock:         apiReleaseLock,
  fetchUsers:          apiFetchUsers,
  createUser:          apiCreateUser,
  updateUser:          apiUpdateUser,
  resetPassword:       apiResetPassword,
  exportBudgets:       apiExportBudgets,
  importBudgets:       apiImportBudgets,
  fetchNotifications:  apiFetchNotifications,
  markRead:            apiMarkNotificationRead,
  lookupEmployee:      apiLookupEmployee,
  fetchLoginStats:     apiFetchLoginStats,
  // AI Library
  fetchRagSystems:     apiFetchRagSystems,
  createRagSystem:     apiCreateRagSystem,
  updateRagSystem:     apiUpdateRagSystem,
  deleteRagSystem:     apiDeleteRagSystem,
  fetchRagEntries:     apiFetchRagEntries,
  createRagEntry:      apiCreateRagEntry,
  updateRagEntry:      apiUpdateRagEntry,
  deleteRagEntry:      apiDeleteRagEntry,
  // Utilities
  mapAiJsonPaste,
  dbToFrontend,
  parseAiResult,
};
