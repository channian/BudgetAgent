/* Library / Assignment / Permissions pages */

const DISPOSITIONS     = ["通過", "退件", "不適用"];
const ENTRY_CATEGORIES = ["歷史資料", "料單", "外部資料", "其他", "待定"];
const EMPTY_ENTRY      = { title: "", keywords: "", content: "", example: "", disposition: "", note: "", entry_category: "其他" };

// Icons for the 5 entry categories
const CAT_ICONS = { "歷史資料": "📋", "料單": "📦", "外部資料": "🌐", "其他": "📁", "待定": "⏳" };

// Category display order and color scheme for the library
const LIB_CATEGORIES = ["設備擴充 (UTI)", "工程擴廠 (新工)", "CIM相關", "法遵 (ESH)"];
const LIB_CAT_COLORS = {
  "設備擴充 (UTI)":  { bg: "#e0f2fe", text: "#0369a1", dot: "#38bdf8" },
  "工程擴廠 (新工)": { bg: "#f3e8ff", text: "#7e22ce", dot: "#a855f7" },
  "CIM相關":         { bg: "#dcfce7", text: "#15803d", dot: "#4ade80" },
  "法遵 (ESH)":      { bg: "#fef3c7", text: "#b45309", dot: "#fbbf24" },
};

function LibraryPage({ currentUser }) {
  const role    = currentUser?.role || "viewer";
  const isAdmin = role === "admin";

  const [systems,    setSystems]    = React.useState([]);
  const [loading,    setLoading]    = React.useState(true);
  const [err,        setErr]        = React.useState("");
  const [active,     setActive]     = React.useState(null);
  const [reseedBusy, setReseedBusy] = React.useState(false);

  // system create/rename modal: null | "new" | system-object
  const [sysModal, setSysModal] = React.useState(null);
  const [sysForm,  setSysForm]  = React.useState({ name: "", description: "", expert_name: "", category: "" });
  const [sysBusy,  setSysBusy]  = React.useState(false);
  const [sysErr,   setSysErr]   = React.useState("");

  const load = () => {
    setLoading(true);
    API.fetchRagSystems()
      .then(rows => { setSystems(rows); setErr(""); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, []);

  const openNewSys  = () => {
    setSysForm({ name: "", description: "", expert_name: "", category: "" });
    setSysErr(""); setSysModal("new");
  };
  const openEditSys = (s) => {
    setSysForm({ name: s.name, description: s.description || "", expert_name: s.expert_name || "", category: s.category || "" });
    setSysErr(""); setSysModal(s);
  };
  const closeSys = () => setSysModal(null);

  const saveSys = async () => {
    if (!sysForm.name.trim()) { setSysErr("系統名稱為必填"); return; }
    setSysBusy(true); setSysErr("");
    try {
      if (sysModal === "new") await API.createRagSystem(sysForm);
      else                    await API.updateRagSystem(sysModal.id, sysForm);
      closeSys(); load();
    } catch (e) { setSysErr(e.message); }
    finally     { setSysBusy(false); }
  };

  const deleteSys = async (s) => {
    if (!confirm(`確定刪除「${s.name}」？此系統下所有 RAG 資料將一併刪除。`)) return;
    try { await API.deleteRagSystem(s.id); load(); }
    catch (e) { alert("刪除失敗：" + e.message); }
  };

  const doReseed = async () => {
    if (!confirm("將以官方名單取代所有「系統 XX」佔位符（有 RAG 資料的系統不受影響）。確定執行？")) return;
    setReseedBusy(true);
    try {
      const r = await API.reseedRagSystems();
      Toast.show(`✅ 重設完成：移除 ${r.deleted} 個佔位符，新增 ${r.added} 個系統`, "ok");
      load();
    } catch (e) { alert("重設失敗：" + e.message); }
    finally { setReseedBusy(false); }
  };

  // Group systems by category in predefined order
  const grouped = React.useMemo(() => {
    const map = {};
    systems.forEach(s => {
      const cat = s.category || "其他";
      if (!map[cat]) map[cat] = [];
      map[cat].push(s);
    });
    const order = [...LIB_CATEGORIES, "其他",
      ...Object.keys(map).filter(c => !LIB_CATEGORIES.includes(c) && c !== "其他")];
    return order.filter(c => map[c]).map(c => ({ cat: c, items: map[c] }));
  }, [systems]);

  // ── RAG detail view ──
  if (active) {
    return (
      <RagSystemDetail
        system={active}
        currentUser={currentUser}
        onBack={() => { setActive(null); load(); }}
      />
    );
  }

  // ── System grid ──
  return (
    <>
      <div className="page-head">
        <div>
          <h2>AI Agent 圖書館</h2>
          <div className="lede">依系統分類管理 AI 審核知識庫（RAG），點入各系統可建立與篩選審核規則</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
          {isAdmin && <>
            <button className="btn ghost" onClick={doReseed} disabled={reseedBusy} title="以官方名單取代佔位符">
              {reseedBusy ? "處理中…" : "重設為官方名單"}
            </button>
            <button className="btn accent" onClick={openNewSys}><Icon.Plus/>新增系統類別</button>
          </>}
        </div>
      </div>

      {err && <div style={{ padding: "8px 0", color: "var(--bad)", fontSize: 13 }}>⚠ {err}</div>}

      {loading ? (
        <div className="empty">載入中…</div>
      ) : systems.length === 0 ? (
        <div className="empty">尚無系統類別{isAdmin ? "，請點右上角「新增系統類別」" : ""}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {grouped.map(({ cat, items }) => {
            const color = LIB_CAT_COLORS[cat] || { bg: "var(--surface-2)", text: "var(--text-muted)", dot: "var(--border-strong)" };
            return (
              <div key={cat}>
                {/* Category header */}
                <div className="lib-cat-header">
                  <span className="lib-cat-dot" style={{ background: color.dot }}/>
                  <span className="lib-cat-label" style={{ color: color.text, background: color.bg }}>
                    {cat}
                  </span>
                  <span className="lib-cat-count">{items.length} 個系統</span>
                </div>
                <div className="sys-grid">
                  {items.map((s) => {
                    const experts = (s.expert_name || "").split(/[、,]/).map(e => e.trim()).filter(Boolean);
                    return (
                      <div key={s.id} className="sys-card" onClick={() => setActive(s)}>
                        <div className="sys-card-top">
                          <div className="sys-av" style={{ background: `linear-gradient(135deg, ${color.bg}, ${color.bg})`, color: color.text }}>
                            <Icon.Book s={18}/>
                          </div>
                          {isAdmin && (
                            <div className="sys-card-actions" onClick={(e) => e.stopPropagation()}>
                              <button className="btn ghost sm" title="編輯" onClick={() => openEditSys(s)}>✎</button>
                              <button className="btn ghost sm" title="刪除" onClick={() => deleteSys(s)}>✕</button>
                            </div>
                          )}
                        </div>
                        <h4 className="sys-name">{s.name}</h4>
                        {experts.length > 0 && (
                          <div className="sys-experts">
                            {experts.map((e, i) => (
                              <span key={i} className="sys-expert-chip">👤 {e}</span>
                            ))}
                          </div>
                        )}
                        {s.description && <div className="sys-desc">{s.description}</div>}
                        <div className="sys-meta">
                          <span><span className="sys-count">{s.entry_count}</span> 筆 RAG 資料</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── System create / rename modal ── */}
      {sysModal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 200, display: "grid", placeItems: "center" }}
             onClick={e => e.target === e.currentTarget && closeSys()}>
          <div className="card" style={{ width: 440, maxWidth: "92vw", padding: 0 }}>
            <div className="card-head" style={{ padding: "16px 20px" }}>
              <h3>{sysModal === "new" ? "新增系統類別" : `編輯：${sysModal.name}`}</h3>
              <button className="btn ghost sm" onClick={closeSys}>✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>所屬類別</label>
                <select value={sysForm.category} onChange={e => setSysForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">— 選擇類別 —</option>
                  {LIB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="其他">其他</option>
                </select>
              </div>
              <div className="field">
                <label>系統名稱 <span className="req">*</span></label>
                <input type="text" value={sysForm.name} autoFocus
                  onChange={e => setSysForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例：空調"/>
              </div>
              <div className="field">
                <label>負責專家（多人用「、」隔開）</label>
                <input type="text" value={sysForm.expert_name}
                  onChange={e => setSysForm(f => ({ ...f, expert_name: e.target.value }))}
                  placeholder="例：王小明、李大華"/>
              </div>
              <div className="field">
                <label>說明（選填）</label>
                <input type="text" value={sysForm.description}
                  onChange={e => setSysForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="此系統類別的用途簡述"/>
              </div>
              {sysErr && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠ {sysErr}</div>}
              <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn ghost" onClick={closeSys}>取消</button>
                <button className="btn primary" onClick={saveSys} disabled={sysBusy}>
                  {sysBusy ? "儲存中…" : sysModal === "new" ? "建立" : "儲存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Level 2: system → 5 category blocks ──────────────────────────────
function RagSystemDetail({ system, currentUser, onBack }) {
  const [allEntries, setAllEntries] = React.useState([]);
  const [loading,    setLoading]    = React.useState(true);
  const [err,        setErr]        = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState(null);

  const load = () => {
    setLoading(true);
    API.fetchRagEntries(system.id)
      .then(rows => { setAllEntries(rows); setErr(""); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, [system.id]);

  // Count entries per category
  const counts = React.useMemo(() => {
    const acc = {};
    ENTRY_CATEGORIES.forEach(c => { acc[c] = 0; });
    allEntries.forEach(e => {
      const cat = e.entry_category || "其他";
      acc[cat] = (acc[cat] || 0) + 1;
    });
    return acc;
  }, [allEntries]);

  // Drill into a category
  if (activeCategory) {
    return (
      <RagCategoryDetail
        system={system}
        category={activeCategory}
        currentUser={currentUser}
        onBack={() => { setActiveCategory(null); load(); }}
      />
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="flex-row" style={{ marginBottom: 8 }}>
            <button className="btn ghost sm" onClick={onBack}><Icon.Back/>返回圖書館</button>
            <span className="tag-sm">RAG 知識庫</span>
          </div>
          <h2 style={{ marginBottom: 2 }}>{system.name}</h2>
          <div className="lede">{system.description || "點入各分類方塊以管理該類 AI 審核規則"}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
        </div>
      </div>

      {err && <div style={{ padding: "8px 0", color: "var(--bad)", fontSize: 13 }}>⚠ {err}</div>}

      <div className="sys-grid" style={{ marginTop: 8 }}>
        {ENTRY_CATEGORIES.map(cat => (
          <div key={cat} className="sys-card" onClick={() => setActiveCategory(cat)}>
            <div className="sys-card-top">
              <div className="sys-av" style={{ fontSize: 22, width: 48, height: 48, borderRadius: 14 }}>
                {CAT_ICONS[cat] || "📁"}
              </div>
            </div>
            <h4 className="sys-name">{cat}</h4>
            <div className="sys-meta">
              {loading
                ? <span style={{ color: "var(--text-muted)" }}>載入中…</span>
                : <><span className="sys-count">{counts[cat] || 0}</span> 筆 RAG 資料</>
              }
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Level 3: category → entry list ───────────────────────────────────
function RagCategoryDetail({ system, category, currentUser, onBack }) {
  const role     = currentUser?.role || "viewer";
  const canWrite = role !== "viewer";

  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState("");

  const [q,    setQ]    = React.useState("");
  const [disp, setDisp] = React.useState("");

  const [modal, setModal] = React.useState(null);
  const [form,  setForm]  = React.useState({ ...EMPTY_ENTRY, entry_category: category });
  const [busy,  setBusy]  = React.useState(false);
  const [mErr,  setMErr]  = React.useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    API.fetchRagEntries(system.id, { entry_category: category, q, disposition: disp })
      .then(rows => { setEntries(rows); setErr(""); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [system.id, category, q, disp]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openNew  = () => { setForm({ ...EMPTY_ENTRY, entry_category: category }); setMErr(""); setModal("new"); };
  const openEdit = (en) => {
    setForm({
      title: en.title || "", keywords: en.keywords || "", content: en.content || "",
      example: en.example || "", disposition: en.disposition || "", note: en.note || "",
      entry_category: en.entry_category || category,
    });
    setMErr(""); setModal(en);
  };
  const closeModal = () => setModal(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setMErr("標題為必填"); return; }
    setBusy(true); setMErr("");
    try {
      if (modal === "new") await API.createRagEntry(system.id, form);
      else                 await API.updateRagEntry(modal.id, form);
      closeModal();
      load();
    } catch (e) { setMErr(e.message); }
    finally     { setBusy(false); }
  };

  const remove = async (en) => {
    if (!confirm(`確定刪除「${en.title}」？`)) return;
    try { await API.deleteRagEntry(en.id); load(); }
    catch (e) { alert("刪除失敗：" + e.message); }
  };

  const dispBadge = (d) =>
    d === "通過" ? <span className="badge ok"><span className="b-dot"/>通過</span>
  : d === "退件" ? <span className="badge bad"><span className="b-dot"/>退件</span>
  : d           ? <span className="badge muted"><span className="b-dot"/>{d}</span>
  :               <span style={{ color: "var(--text-muted)" }}>—</span>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="flex-row" style={{ marginBottom: 8, gap: 8 }}>
            <button className="btn ghost sm" onClick={onBack}><Icon.Back/>返回 {system.name}</button>
            <span className="tag-sm">{CAT_ICONS[category]} {category}</span>
          </div>
          <h2 style={{ marginBottom: 2 }}>{system.name} — {category}</h2>
          <div className="lede">管理此系統「{category}」類別的 AI 審核規則與案例</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
          {canWrite && <button className="btn accent" onClick={openNew}><Icon.Plus/>建立 RAG 資料</button>}
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon.Search/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋標題、關鍵字、內容…"/>
        </div>
        <div className="divider"/>
        <select className="field-sel" value={disp} onChange={e => setDisp(e.target.value)}>
          <option value="">全部處置</option>
          {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="spacer-x"/>
        <span className="hint">{entries.length} 筆</span>
      </div>

      {err && <div style={{ padding: "8px 0", color: "var(--bad)", fontSize: 13 }}>⚠ {err}</div>}

      <div className="card">
        <div className="card-body tight" style={{ maxHeight: 520, overflowY: "auto" }}>
          {loading ? (
            <div className="empty">載入中…</div>
          ) : entries.length === 0 ? (
            <div className="empty">查無 RAG 資料{canWrite ? "，可點右上角「建立 RAG 資料」新增" : ""}</div>
          ) : (
            <>
              <div className="rag-row head">
                <div>標題 / 關鍵字</div>
                <div>內容</div>
                <div>建議處置</div>
                <div>建立者</div>
                {canWrite && <div style={{ textAlign: "right" }}>操作</div>}
              </div>
              {entries.map(en => (
                <div className="rag-row" key={en.id}>
                  <div>
                    <div className="rag-title">{en.title}</div>
                    {en.keywords && <div className="rag-kw">{en.keywords}</div>}
                  </div>
                  <div className="rag-content" title={en.content || ""}>{en.content || "—"}</div>
                  <div>{dispBadge(en.disposition)}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{en.created_by || "—"}</div>
                  {canWrite && (
                    <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() => openEdit(en)}>編輯</button>
                      <button className="btn sm ghost" onClick={() => remove(en)}>刪除</button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Entry create / edit modal ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 200, display: "grid", placeItems: "center" }}
             onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="card" style={{ width: 540, maxWidth: "94vw", padding: 0, maxHeight: "90vh", overflow: "auto" }}>
            <div className="card-head" style={{ padding: "16px 20px", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
              <h3>{modal === "new" ? "建立 RAG 資料" : "編輯 RAG 資料"}</h3>
              <button className="btn ghost sm" onClick={closeModal}>✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>標題 <span className="req">*</span></label>
                <input type="text" value={form.title} autoFocus
                  onChange={e => set("title", e.target.value)} placeholder="例：單筆採購逾 50 萬須附三家報價"/>
              </div>
              <div className="field">
                <label>關鍵字 <span className="opt">(以逗號分隔，供搜尋篩選)</span></label>
                <input type="text" value={form.keywords}
                  onChange={e => set("keywords", e.target.value)} placeholder="採購, 報價, 金額門檻"/>
              </div>
              <div className="field">
                <label>內容 / 判斷規則</label>
                <textarea rows={4} value={form.content}
                  onChange={e => set("content", e.target.value)} placeholder="說明此規則的判斷依據與適用情境…"/>
              </div>
              <div className="field">
                <label>範例 <span className="opt">(選填)</span></label>
                <textarea rows={3} value={form.example}
                  onChange={e => set("example", e.target.value)} placeholder="實際案例或範例說明…"/>
              </div>
              <div className="field-row two">
                <div className="field">
                  <label>分類</label>
                  <select value={form.entry_category} onChange={e => set("entry_category", e.target.value)}>
                    {ENTRY_CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>建議處置</label>
                  <select value={form.disposition} onChange={e => set("disposition", e.target.value)}>
                    <option value="">— 不指定 —</option>
                    {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>備註 <span className="opt">(選填)</span></label>
                <input type="text" value={form.note} onChange={e => set("note", e.target.value)} placeholder="其他補充"/>
              </div>
              {mErr && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠ {mErr}</div>}
              <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn ghost" onClick={closeModal}>取消</button>
                <button className="btn primary" onClick={save} disabled={busy}>
                  {busy ? "儲存中…" : modal === "new" ? "建立" : "儲存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AssignmentPage({ currentUser }) {
  const isAdmin = currentUser?.role === "admin";

  const [aiCases,     setAiCases]     = React.useState([]);
  const [dispatched,  setDispatched]  = React.useState([]);
  const [loading,     setLoading]     = React.useState(true);
  const [experts,     setExperts]     = React.useState([]);
  const [forms,       setForms]       = React.useState({});   // {dbId: {budget_no, expert_name}}
  const [dispatching, setDispatching] = React.useState({});   // {dbId: true}
  const [doneInfo,    setDoneInfo]    = React.useState({});   // {dbId: updatedBudget}
  const [errMsg,      setErrMsg]      = React.useState({});

  // 已派發 search filter
  const [dispatchFilter, setDispatchFilter] = React.useState("");

  // Reassign state
  const [reassignBudget, setReassignBudget] = React.useState(null);
  const [reassignForm,   setReassignForm]   = React.useState({ expert_name: "", reason: "" });
  const [reassigning,    setReassigning]    = React.useState(false);
  const [reassignErr,    setReassignErr]    = React.useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [pending, completed, users] = await Promise.all([
        API.fetchBudgets("pending"),
        API.fetchBudgets("completed"),
        API.fetchUsers(),
      ]);
      const ai   = pending.filter(b => b.status === "AI_REVIEW" && (b.aiResult === "approve" || b.aiResult === "reject") && b.frontendSubmitted);
      const sent = [
        ...pending.filter(b => b.status !== "AI_REVIEW"),
        ...completed.filter(b => b.dispatchDate),
      ].sort((a, b) => (b.dispatchDate || 0) - (a.dispatchDate || 0));

      setAiCases(ai);
      setDispatched(sent);
      setExperts(users.filter(u => u.role === "expert"));
      const init = {};
      ai.forEach(b => { init[b.dbId] = { budget_no: b.budgetNo || "", expert_name: b.expertName || "" }; });
      setForms(init);
      setDoneInfo({}); setErrMsg({});
    } catch (e) {
      setErrMsg({ _global: e.message });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const setField = (dbId, field, val) =>
    setForms(f => ({ ...f, [dbId]: { ...(f[dbId] || {}), [field]: val } }));

  const doDispatch = async (b) => {
    const f = forms[b.dbId] || {};
    const expert = (f.expert_name || "").trim();
    if (!expert) {
      setErrMsg(err => ({ ...err, [b.dbId]: "請先選擇負責專家" }));
      return;
    }
    if (!confirm(
      `確定派發案件「${b.project}」給「${expert}」？\n` +
      `派發後將寄出通知 Email 給該專家，並進入專家審核流程。`
    )) return;
    setDispatching(d => ({ ...d, [b.dbId]: true }));
    setErrMsg(e => { const n = { ...e }; delete n[b.dbId]; return n; });
    try {
      const { budget: updated, emailStatus } = await API.dispatch(b.dbId, forms[b.dbId] || {});
      setDoneInfo(d => ({ ...d, [b.dbId]: updated }));
      // Email status toast
      const expert = updated.expertName || b.expertName || "—";
      if (emailStatus === "sent")
        Toast.show(`✅ 已寄出通知 Email 給 ${expert}`, "ok");
      else if (emailStatus === "no_email")
        Toast.show(`⚠ 找不到 ${expert} 的信箱，Email 未寄出`, "warn");
      else if (emailStatus === "failed" || emailStatus === "error")
        Toast.show(`❌ Email 寄送失敗（${expert}），請確認 SMTP 設定`, "err");
      setTimeout(() => {
        setAiCases(cs => cs.filter(c => c.dbId !== b.dbId));
        setDispatched(ds => [updated, ...ds]);
        setDoneInfo(d => { const n = { ...d }; delete n[b.dbId]; return n; });
      }, 2000);
    } catch (e) {
      setErrMsg(err => ({ ...err, [b.dbId]: e.message }));
    } finally {
      setDispatching(d => ({ ...d, [b.dbId]: false }));
    }
  };

  const openReassign = (b) => {
    setReassignBudget(b);
    setReassignForm({ expert_name: b.expertName || "", reason: "" });
    setReassignErr("");
  };
  const closeReassign = () => { setReassignBudget(null); };

  const doReassign = async () => {
    if (!reassignForm.expert_name.trim()) { setReassignErr("請選擇新的負責專家"); return; }
    if (!reassignForm.reason.trim())      { setReassignErr("請填寫重派原因");     return; }
    setReassigning(true); setReassignErr("");
    try {
      await API.reassign(reassignBudget.dbId, reassignForm);
      closeReassign();
      load();
      Toast.show(`✅ 已重新派發給「${reassignForm.expert_name}」`, "ok");
    } catch (e) {
      setReassignErr(e.message);
    } finally {
      setReassigning(false);
    }
  };

  const doDeleteCase = async (b) => {
    if (!confirm(
      `確定刪除案件「${b.project}」？\n此操作無法復原，相關審核紀錄將一併移除。`
    )) return;
    try {
      await API.deleteBudget(b.dbId, "管理員於派發中心刪除");
      setDispatched(ds => ds.filter(d => d.dbId !== b.dbId));
      setAiCases(cs => cs.filter(c => c.dbId !== b.dbId));
      Toast.show("✅ 案件已刪除", "ok");
    } catch (e) {
      setErrMsg(err => ({ ...err, _global: e.message }));
    }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("zh-TW") : "—";

  return (
    <>
      <div className="page-head">
        <div>
          <h2>派發中心</h2>
          <div className="lede">為 AI 初審完成的案件指定負責專家並派發；預算單號請至主畫面（待簽核）填入</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
        </div>
      </div>

      {errMsg._global && (
        <div style={{ padding: "8px 14px", background: "var(--bad-soft)", color: "var(--bad)", borderRadius: "var(--radius)", fontSize: 12 }}>
          ⚠ {errMsg._global}
        </div>
      )}

      {/* ── 待派發 ── */}
      <div className="card">
        <div className="card-head">
          <h3>待派發案件 <span className="tag">AI_REVIEW</span></h3>
          <span className="hint">{loading ? "載入中…" : `${aiCases.length} 件待派發`}</span>
        </div>
        <div className="card-body tight" style={{ maxHeight: 480, overflowY: "auto" }}>
          {loading ? (
            <div className="empty">載入中…</div>
          ) : aiCases.length === 0 ? (
            <div className="empty">🎉 目前沒有待派發案件</div>
          ) : (
            <>
              <div className="dispatch-row head">
                <div>週</div>
                <div>項目名稱</div>
                <div>類別</div>
                <div>金額</div>
                <div>負責專家</div>
                <div></div>
              </div>
              {aiCases.map(b => {
                const f       = forms[b.dbId] || {};
                const info    = doneInfo[b.dbId];
                const isDone  = !!info;
                const isBusy  = dispatching[b.dbId];
                const err     = errMsg[b.dbId];
                return (
                  <div key={b.dbId} className={`dispatch-row ${isDone ? "dispatched" : ""}`}>
                    <div><span className="week-pill">W{String(b.week).padStart(2, "0")}</span></div>
                    <div className="nm" title={b.project}>{b.project}</div>
                    <div><CategoryChip id={b.categoryId} name={b.category}/></div>
                    <div className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
                      NT$ {fmtAmount(b.amount)}
                    </div>
                    <div>
                      {experts.length > 0 ? (
                        <select
                          className="cell-input"
                          value={f.expert_name || ""}
                          onChange={e => setField(b.dbId, "expert_name", e.target.value)}
                          disabled={isDone || isBusy}
                        >
                          <option value="">— 選擇專家 —</option>
                          {experts.map(ex => (
                            <option key={ex.id} value={ex.name}>{ex.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="cell-input"
                          placeholder="填入專家姓名"
                          value={f.expert_name || ""}
                          onChange={e => setField(b.dbId, "expert_name", e.target.value)}
                          disabled={isDone || isBusy}
                        />
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {isDone ? (
                          <span className="badge ok" style={{ whiteSpace: "nowrap" }}>
                            ✓ 已派發給 {info.expertName || "（未指定）"}
                          </span>
                        ) : (
                          <button
                            className="btn sm accent"
                            onClick={() => doDispatch(b)}
                            disabled={isBusy}
                          >{isBusy ? "派發中…" : "派發"}</button>
                        )}
                        {isAdmin && !isDone && (
                          <button className="btn sm ghost" style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
                            onClick={() => doDeleteCase(b)}>刪除</button>
                        )}
                      </div>
                      {err && <span style={{ fontSize: 10.5, color: "var(--bad)" }}>{err}</span>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── 已派發 ── */}
      <div className="card">
        <div className="card-head">
          <h3>已派發案件</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="search" style={{ width: 220 }}>
              <Icon.Search/>
              <input
                value={dispatchFilter}
                onChange={e => setDispatchFilter(e.target.value)}
                placeholder="篩選案件名稱…"
              />
            </div>
            <span className="hint">
              {dispatchFilter
                ? `${dispatched.filter(b => b.project.toLowerCase().includes(dispatchFilter.toLowerCase())).length} / ${dispatched.length} 件`
                : `${dispatched.length} 件`}
            </span>
          </div>
        </div>
        <div className="card-body tight" style={{ maxHeight: 480, overflowY: "auto" }}>
          {dispatched.length === 0 ? (
            <div className="empty">尚無已派發案件</div>
          ) : (
            <>
              <div className="sent-row head">
                <div>週</div>
                <div>項目名稱</div>
                <div>預算單號</div>
                <div>負責專家</div>
                <div>派發日期</div>
                <div>狀態</div>
                <div style={{ textAlign: "right" }}>操作</div>
              </div>
              {dispatched.filter(b =>
                !dispatchFilter || b.project.toLowerCase().includes(dispatchFilter.toLowerCase())
              ).map(b => (
                <div key={b.dbId} className="sent-row">
                  <div><span className="week-pill">W{String(b.week).padStart(2, "0")}</span></div>
                  <div className="nm" title={b.project}>{b.project}</div>
                  <div className="mono" style={{ fontSize: 12 }}>{b.budgetNo || <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
                  <div>{b.expertName || <span style={{ color: "var(--text-muted)" }}>未指定</span>}</div>
                  <div className="mono" style={{ fontSize: 12 }}>{fmtDate(b.dispatchDate)}</div>
                  <div><StatusBadge status={b.status}/></div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn sm ghost" onClick={() => openReassign(b)}>重派</button>
                    {isAdmin && (
                      <button className="btn sm ghost" style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
                        onClick={() => doDeleteCase(b)}>刪除</button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Reassign modal ── */}
      {reassignBudget && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 200, display: "grid", placeItems: "center" }}
             onClick={e => e.target === e.currentTarget && closeReassign()}>
          <div className="card" style={{ width: 440, maxWidth: "92vw", padding: 0 }}>
            <div className="card-head" style={{ padding: "16px 20px" }}>
              <h3>重新派發</h3>
              <button className="btn ghost sm" onClick={closeReassign}>✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                案件：<b style={{ color: "var(--text)" }}>{reassignBudget.project}</b>
              </div>
              <div className="field">
                <label>重派原因 <span className="req">*</span></label>
                <textarea rows={3} value={reassignForm.reason}
                  onChange={e => setReassignForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="說明重新派發的原因…"/>
              </div>
              <div className="field">
                <label>新負責專家 <span className="req">*</span></label>
                {experts.length > 0 ? (
                  <select value={reassignForm.expert_name}
                    onChange={e => setReassignForm(f => ({ ...f, expert_name: e.target.value }))}>
                    <option value="">— 選擇專家 —</option>
                    {experts.map(ex => (
                      <option key={ex.id} value={ex.name}>{ex.name}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={reassignForm.expert_name}
                    onChange={e => setReassignForm(f => ({ ...f, expert_name: e.target.value }))}
                    placeholder="填入專家姓名"/>
                )}
              </div>
              {reassignErr && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠ {reassignErr}</div>}
              <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn ghost" onClick={closeReassign}>取消</button>
                <button className="btn primary" onClick={doReassign} disabled={reassigning}>
                  {reassigning ? "派發中…" : "確認重派"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const ROLE_LABELS = { admin: "系統管理員", expert: "專家複審", viewer: "檢視者" };
const ROLE_COLORS = { admin: "var(--bad)", expert: "var(--accent)", viewer: "var(--text-muted)" };

const EMPTY_FORM = { name: "", ad_account: "", department: "", email: "", role: "viewer" };

function PermissionsPage({ currentUser }) {
  const [users,   setUsers]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState("");

  // Modal state: null = closed, "new" = create, user-object = edit
  const [modal,   setModal]   = React.useState(null);
  const [form,    setForm]    = React.useState(EMPTY_FORM);
  const [saving,  setSaving]  = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");
  const [deleting, setDeleting] = React.useState(null); // id being deleted

  const load = () => {
    setLoading(true);
    API.fetchUsers()
      .then(rows => { setUsers(rows); setErr(""); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, []);

  const openNew  = () => { setForm(EMPTY_FORM); setSaveErr(""); setModal("new"); };
  const openEdit = (u) => { setForm({ name: u.name, ad_account: u.ad_account, department: u.department || "", email: u.email || "", role: u.role }); setSaveErr(""); setModal(u); };
  const closeModal = () => { setModal(null); setSaveErr(""); };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.ad_account.trim()) { setSaveErr("姓名與 AD 帳號為必填"); return; }
    setSaving(true); setSaveErr("");
    try {
      if (modal === "new") {
        await API.createUser(form);
      } else {
        await API.updateUser(modal.id, { name: form.name, department: form.department, email: form.email, role: form.role });
      }
      closeModal();
      load();
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (u) => {
    if (!confirm(`確定要刪除使用者「${u.name}」（${u.ad_account}）？此操作無法復原。`)) return;
    setDeleting(u.id);
    try {
      await API.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (e) {
      setErr("刪除失敗：" + e.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>權限管理中心</h2>
          <div className="lede">管理使用者帳號與角色權限</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
          <button className="btn accent" onClick={openNew}><Icon.Plus/>新增使用者</button>
        </div>
      </div>

      {err && <div style={{ padding: "8px 0", color: "var(--bad)", fontSize: 13 }}>⚠ {err}</div>}

      {/* ── User table ── */}
      <div className="card">
        <div className="card-body tight" style={{ maxHeight: 480, overflowY: "auto" }}>
          <div className="user-row head">
            <div>姓名</div>
            <div>AD 帳號</div>
            <div>角色</div>
            <div>部門</div>
            <div style={{ textAlign: "right" }}>操作</div>
          </div>
          {loading && <div style={{ padding: 20, color: "var(--text-muted)", textAlign: "center" }}>載入中…</div>}
          {!loading && users.length === 0 && <div style={{ padding: 20, color: "var(--text-muted)", textAlign: "center" }}>尚無使用者</div>}
          {users.map(u => (
            <div className="user-row" key={u.id}>
              <div className="nm">
                <div className="av">{(u.name || "?")[0]}</div>
                <div>{u.name}</div>
              </div>
              <div className="mono" style={{ fontSize: 12 }}>{u.ad_account}</div>
              <div>
                <span className="tag-sm" style={{ color: ROLE_COLORS[u.role] }}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{u.department || "—"}</div>
              <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="btn sm" onClick={() => openEdit(u)}>編輯</button>
                {currentUser && u.id !== currentUser.id && (
                  <button
                    className="btn sm"
                    style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
                    onClick={() => doDelete(u)}
                    disabled={deleting === u.id}
                  >
                    {deleting === u.id ? "刪除中…" : "刪除"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Role reference ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>角色權限對照 <span className="tag">REFERENCE</span></h3></div>
        <div className="card-body tight">
          {MOCK.ROLES.map(r => (
            <div key={r.id} className="user-row" style={{ gridTemplateColumns: "120px 1fr" }}>
              <div><span className="tag-sm" style={{ color: ROLE_COLORS[r.id] }}>{r.name}</span></div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 200, display: "grid", placeItems: "center" }}
             onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="card" style={{ width: 440, maxWidth: "92vw", padding: 0 }}>
            <div className="card-head" style={{ padding: "16px 20px" }}>
              <h3>{modal === "new" ? "新增使用者" : `編輯：${modal.name}`}</h3>
              <button className="btn ghost sm" onClick={closeModal}>✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              <div className="field-row two">
                <div className="field">
                  <label>姓名 <span className="req">*</span></label>
                  <input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="中文姓名"/>
                </div>
                <div className="field">
                  <label>部門</label>
                  <input type="text" value={form.department} onChange={e => set("department", e.target.value)} placeholder="例：資訊處"/>
                </div>
              </div>

              <div className="field-row two">
                <div className="field">
                  <label>員工編號 (empno) <span className="req">*</span></label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="text" value={form.ad_account} onChange={e => set("ad_account", e.target.value)}
                      placeholder="例：K20076" disabled={modal !== "new"}
                      style={{ opacity: modal !== "new" ? 0.5 : 1, flex: 1 }}/>
                    {modal === "new" && (
                      <button type="button" className="btn sm ghost"
                        title="從 HR 系統查詢姓名與 Email"
                        onClick={async () => {
                          const empno = form.ad_account.trim();
                          if (!empno) { setSaveErr("請先輸入員工編號"); return; }
                          setSaveErr("");
                          try {
                            const res = await API.lookupEmployee(empno);
                            if (res.found) {
                              setForm(f => ({ ...f, name: res.name || f.name, email: res.email || f.email }));
                            } else {
                              setSaveErr(`HR 系統查無 empno：${empno}`);
                            }
                          } catch (e) { setSaveErr(e.message); }
                        }}>查詢</button>
                    )}
                  </div>
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="text" value={form.email} onChange={e => set("email", e.target.value)} placeholder="選填，查詢後自動帶入"/>
                </div>
              </div>

              <div className="field-row two">
                <div className="field">
                  <label>角色 <span className="req">*</span></label>
                  <select value={form.role} onChange={e => set("role", e.target.value)}>
                    <option value="admin">admin — 系統管理員</option>
                    <option value="expert">expert — 專家複審</option>
                    <option value="viewer">viewer — 檢視者</option>
                  </select>
                </div>
              </div>

              {saveErr && <div style={{ color: "var(--bad)", fontSize: 13 }}>⚠ {saveErr}</div>}

              <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button className="btn ghost" onClick={closeModal}>取消</button>
                <button className="btn primary" onClick={save} disabled={saving}>
                  {saving ? "儲存中…" : modal === "new" ? "建立" : "儲存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Activity / Login stats page ──────────────────────────────────────
function ActivityPage() {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState("");

  const load = () => {
    setLoading(true); setErr("");
    API.fetchLoginStats()
      .then(d => setData(d))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, []);

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d    = new Date(iso);
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60)    return "剛剛";
    if (diff < 3600)  return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
    return d.toLocaleDateString("zh-TW");
  };

  const statusDot = (last_login) => {
    if (!last_login) return { cls: "dot-red",   label: "從未登入" };
    const days = (Date.now() - new Date(last_login)) / 86400000;
    if (days <= 7)  return { cls: "dot-green",  label: "活躍" };
    if (days <= 30) return { cls: "dot-amber",  label: "近 30 天" };
    return            { cls: "dot-red",   label: "超過 30 天" };
  };

  const summary = data?.summary || {};
  const users   = data?.users   || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>使用狀況</h2>
          <div className="lede">追蹤使用者登入紀錄，瞭解哪些人在使用平台、最後上線時間與登入頻率</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
        </div>
      </div>

      {err && <div style={{ padding: "8px 0", color: "var(--bad)", fontSize: 13 }}>⚠ {err}</div>}

      {/* ── KPI cards ── */}
      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "總使用者數",       value: loading ? "…" : summary.total_users ?? 0,  sub: "已建立帳號",        col: "var(--accent)" },
          { label: "活躍（7 天）",     value: loading ? "…" : summary.active_7d    ?? 0,  sub: "近 7 天登入過",    col: "#10b981" },
          { label: "活躍（30 天）",    value: loading ? "…" : summary.active_30d   ?? 0,  sub: "近 30 天登入過",   col: "#06b6d4" },
          { label: "今日登入次數",     value: loading ? "…" : summary.logins_today ?? 0,  sub: "今天",             col: "#f59e0b" },
        ].map(k => (
          <div key={k.label} className="kpi" style={{ borderTop: `3px solid ${k.col}` }}>
            <div className="lbl">{k.label}</div>
            <div className="val" style={{ color: k.col, fontSize: 28, fontWeight: 700 }}>{k.value}</div>
            <div className="sub" style={{ color: "var(--text-muted)", fontSize: 12 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── User table ── */}
      <div className="card">
        <div className="card-head">
          <h3>使用者登入紀錄</h3>
          <span className="hint">{users.length} 位使用者</span>
        </div>
        <div className="card-body tight" style={{ maxHeight: 480, overflowY: "auto" }}>
          {loading ? (
            <div className="empty">載入中…</div>
          ) : users.length === 0 ? (
            <div className="empty">尚無資料</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.4fr 80px 80px 90px", gap: "0 8px",
                            padding: "8px 14px", fontWeight: 600, fontSize: 12, color: "var(--text-muted)",
                            borderBottom: "1px solid var(--border)" }}>
                <div>使用者</div><div>角色</div><div>部門</div><div>最後登入</div>
                <div style={{ textAlign: "right" }}>7 天</div>
                <div style={{ textAlign: "right" }}>30 天</div>
                <div>狀態</div>
              </div>
              {users.map(u => {
                const dot = statusDot(u.last_login);
                return (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.4fr 80px 80px 90px",
                                           gap: "0 8px", padding: "10px 14px", alignItems: "center",
                                           borderBottom: "1px solid var(--border-soft)", fontSize: 13 }}>
                    {/* name + account */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-soft)",
                                    color: "var(--accent)", display: "grid", placeItems: "center",
                                    fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                        {(u.name || "?")[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name || "—"}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "monospace" }}>{u.ad_account}</div>
                      </div>
                    </div>
                    {/* role */}
                    <div>
                      <span className="tag-sm" style={{ color: ROLE_COLORS[u.role] }}>{ROLE_LABELS[u.role] || u.role}</span>
                    </div>
                    {/* dept */}
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{u.department || "—"}</div>
                    {/* last login */}
                    <div style={{ fontSize: 12 }}>{fmtDate(u.last_login)}</div>
                    {/* 7d count */}
                    <div style={{ textAlign: "right", fontWeight: 600, color: u.logins_7d > 0 ? "#10b981" : "var(--text-muted)" }}>
                      {u.logins_7d ?? 0}
                    </div>
                    {/* 30d count */}
                    <div style={{ textAlign: "right", fontWeight: 600, color: u.logins_30d > 0 ? "#06b6d4" : "var(--text-muted)" }}>
                      {u.logins_30d ?? 0}
                    </div>
                    {/* status dot */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: dot.cls === "dot-green" ? "#10b981" : dot.cls === "dot-amber" ? "#f59e0b" : "#ef4444"
                      }} />
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{dot.label}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      <style>{`
        .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; }
        .kpi .lbl { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
        .kpi .sub { margin-top: 2px; }
      `}</style>
    </>
  );
}

// ── Data Import page ─────────────────────────────────────────────────
function DataImportPage({ onNew, onRefresh, currentUser }) {
  const [busy,         setBusy]         = React.useState(false);
  const [impMsg,       setImpMsg]       = React.useState("");
  // AI建單：RPA created, not yet frontend-confirmed
  const [aiCases,      setAiCases]      = React.useState([]);
  // 前端建單：manually created, waiting for AI
  const [frontendCases,setFrontendCases]= React.useState([]);
  const [casesLoading, setCasesLoading] = React.useState(true);
  const [confirmBusy,  setConfirmBusy]  = React.useState({});
  const fileRef = React.useRef();

  // Sheet picker modal state: null | { file, sheets: [...], selected: str }
  const [sheetModal, setSheetModal] = React.useState(null);

  const loadCases = () => {
    setCasesLoading(true);
    API.fetchBudgets("pending")
      .then(all => {
        const aiR = all.filter(b => b.status === "AI_REVIEW");
        // "has real AI decision" = approve or reject (never "hold", which is parseAiResult's fallback for null)
        setAiCases(aiR.filter(b => (b.aiResult === "approve" || b.aiResult === "reject") && !b.frontendSubmitted));
        setFrontendCases(aiR.filter(b => b.aiResult !== "approve" && b.aiResult !== "reject" && b.frontendSubmitted));
      })
      .catch(() => {})
      .finally(() => setCasesLoading(false));
  };

  React.useEffect(loadCases, []);

  const doConfirm = async (b) => {
    setConfirmBusy(s => ({ ...s, [b.dbId]: true }));
    try {
      await API.confirmFrontend(b.dbId);
      Toast.show(`✅ 已確認「${b.project}」，進入派發中心`, "ok");
      loadCases();
      onRefresh && onRefresh();
    } catch (e) {
      Toast.show(`❌ 確認失敗：${e.message}`, "err");
    } finally {
      setConfirmBusy(s => ({ ...s, [b.dbId]: false }));
    }
  };

  const doExport = async () => {
    setBusy(true);
    try {
      await API.exportBudgets("completed", "csv");
    } catch (e) {
      alert("匯出失敗：" + e.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 1: pick file → probe for sheets
  const onFilePicked = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setImpMsg("");
    try {
      const { sheets } = await API.getImportSheets(file);
      if (sheets.length === 1) {
        // single sheet → import immediately
        await _runImport(file, sheets[0]);
      } else {
        setSheetModal({ file, sheets, selected: sheets[0] });
      }
    } catch (err) {
      setImpMsg("⚠ 檔案解析失敗：" + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 2: confirm sheet and import
  const doImportSheet = async () => {
    if (!sheetModal) return;
    const { file, selected } = sheetModal;
    setSheetModal(null);
    setBusy(true); setImpMsg("");
    await _runImport(file, selected);
  };

  const _runImport = async (file, sheet) => {
    try {
      const result = await API.importBudgets(file, { sheet, mode: "completed" });
      setImpMsg(API.formatImportResult(result));
      onRefresh();
    } catch (err) {
      setImpMsg({ ok: false, text: "⚠ 匯入失敗：" + err.message, errors: [], detail: [] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>前端資料導入</h2>
          <div className="lede">手動建立預算單，或以 CSV 批次匯入、匯出現有資料</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={doExport} disabled={busy}>
            <Icon.Download/>匯出 CSV
          </button>
          <button className="btn" onClick={() => fileRef.current.click()} disabled={busy}>
            <Icon.Upload/>匯入已簽核 Excel
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={onFilePicked}/>
          <button className="btn accent" onClick={onNew}>
            <Icon.Plus/>建立預算單
          </button>
        </div>
      </div>

      {impMsg && (
        <div style={{
          background: impMsg.ok ? "var(--ok-soft)" : "var(--bad-soft)",
          color:      impMsg.ok ? "var(--ok)"      : "var(--bad)",
          borderRadius: "var(--radius)", fontSize: 13, marginBottom: 4,
        }}>
          <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>{impMsg.text}</span>
            <button onClick={() => setImpMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 600 }}>✕</button>
          </div>
          {((impMsg.detail && impMsg.detail.length > 0) || (impMsg.errors && impMsg.errors.length > 0)) && (
            <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
              {(impMsg.detail || []).map((d, i) => (
                <div key={"d" + i} style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.5 }}>{d}</div>
              ))}
              {impMsg.errors && impMsg.errors.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, margin: "4px 0" }}>錯誤明細（前 {impMsg.errors.length} 列）：</div>
                  {impMsg.errors.map((e, i) => (
                    <div key={"e" + i} className="mono" style={{ fontSize: 11, opacity: 0.85 }}>{e}</div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Section 1: AI建單 — RPA created but not yet confirmed ── */}
      <div className="card">
        <div className="card-head" style={{ background: "oklch(0.97 0.015 250)" }}>
          <h3 style={{ color: "#1d4ed8" }}>
            AI 建單
            <span className="block-tag" style={{ marginLeft: 8, background: "#dbeafe", color: "#1d4ed8" }}>
              AI pipeline 已初審，等待前端確認後進入派發中心
            </span>
          </h3>
          <span className="hint">{casesLoading ? "載入中…" : `${aiCases.length} 件`}</span>
        </div>
        <div className="card-body tight" style={{ maxHeight: 380, overflowY: "auto" }}>
          {casesLoading ? (
            <div className="empty">載入中…</div>
          ) : aiCases.length === 0 ? (
            <div className="empty">目前沒有待確認的 AI 建單</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 120px 110px 100px",
                            gap: "0 10px", padding: "8px 14px", background: "var(--surface-2)",
                            fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)",
                            letterSpacing: "0.04em", borderBottom: "1px solid var(--border)" }}>
                <div>週</div><div>項目名稱</div><div>類別</div><div>金額</div><div>AI 結果</div><div>操作</div>
              </div>
              {aiCases.map(b => (
                <div key={b.dbId} style={{ display: "grid", gridTemplateColumns: "60px 1fr 120px 120px 110px 100px",
                                           gap: "0 10px", padding: "10px 14px", alignItems: "center",
                                           borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <div><span className="week-pill">W{String(b.week).padStart(2, "0")}</span></div>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                       title={b.project}>{b.project}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{b.subCategory || b.category || "—"}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, textAlign: "right" }}>
                    NT$ {(Number(b.amount) || 0).toLocaleString()}
                  </div>
                  <div><ResultBadge result={b.aiResult} kind="ai"/></div>
                  <div>
                    <button className="btn accent sm" disabled={!!confirmBusy[b.dbId]}
                            onClick={() => doConfirm(b)}
                            style={{ fontSize: 11, padding: "3px 10px" }}>
                      {confirmBusy[b.dbId] ? "確認中…" : "✓ 確認"}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ padding: "10px 16px", background: "var(--surface-2)", fontSize: 12,
                      color: "var(--text-muted)", borderTop: "1px solid var(--border)", lineHeight: 1.7 }}>
          💡 AI pipeline 已自動建立並完成初審。點「確認」後案件立即進入派發中心，供管理員指派專家。
          若預算單名稱與前端建立的案件相同，建立新預算單時會自動完成合併。
        </div>
      </div>

      {/* ── Section 2: 前端建單 — manually created, waiting for AI ── */}
      <div className="card">
        <div className="card-head" style={{ background: "oklch(0.97 0.01 60)" }}>
          <h3 style={{ color: "#92400e" }}>
            前端建單
            <span className="block-tag" style={{ marginLeft: 8 }}>等待 AI pipeline 初審</span>
          </h3>
          <span className="hint">{casesLoading ? "載入中…" : `${frontendCases.length} 件`}</span>
        </div>
        <div className="card-body tight" style={{ maxHeight: 300, overflowY: "auto" }}>
          {casesLoading ? (
            <div className="empty">載入中…</div>
          ) : frontendCases.length === 0 ? (
            <div className="empty">🎉 目前沒有等待 AI 初審的案件</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 130px 120px 130px",
                            gap: "0 12px", padding: "8px 14px", background: "var(--surface-2)",
                            fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)",
                            letterSpacing: "0.04em", borderBottom: "1px solid var(--border)" }}>
                <div>週</div><div>項目名稱</div><div>類別</div><div>金額</div><div>狀態</div>
              </div>
              {frontendCases.map(b => (
                <div key={b.dbId} style={{ display: "grid", gridTemplateColumns: "60px 1fr 130px 120px 130px",
                                           gap: "0 12px", padding: "10px 14px", alignItems: "center",
                                           borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <div><span className="week-pill">W{String(b.week).padStart(2, "0")}</span></div>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                       title={b.project}>{b.project}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{b.category || "—"}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, textAlign: "right" }}>
                    NT$ {(Number(b.amount) || 0).toLocaleString()}
                  </div>
                  <div>
                    <span style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 4,
                                   background: "#f59e0b22", color: "#f59e0b", fontWeight: 700 }}>
                      等待 AI 初審
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ padding: "10px 16px", background: "var(--surface-2)", fontSize: 12,
                      color: "var(--text-muted)", borderTop: "1px solid var(--border)", lineHeight: 1.7 }}>
          💡 這些案件由前端手動建立，尚未有 AI 初審資料。AI pipeline 執行後，名稱相同的案件會自動合併並進入派發中心。
        </div>
      </div>

      {/* ── Format explanation ── */}
      <div className="card">
        <div className="card-head">
          <h3>匯入格式說明</h3>
          <span className="tag">Excel / CSV — 已簽核歷史資料</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
            匯入檔案第一列為欄位標題，資料從第二列起。系統以「Project Name」為唯一索引，重複項目將自動更新。匯入後資料直接進入<b>已簽核完成</b>（CLOSED / REJECTED）。
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="dt" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>欄位標題</th>
                  <th style={{ textAlign: "center" }}>必填</th>
                  <th>說明</th>
                  <th>範例</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Project Name",  "✓", "預算案件唯一名稱",                   "2024-Q1-ERP升級計畫"],
                  ["週數(w)",       "",  "ISO 週數，接受 W21 或 21",            "W21"],
                  ["類別",          "",  "業務類別（設備擴充、工程擴廠…）",      "設備擴充 (UTI)"],
                  ["BudgetNo.",     "",  "預算單號",                            "B2024-001"],
                  ["預算負責人",    "",  "申請人 / 負責人姓名（也接受 Owner）",  "王小明"],
                  ["金額",          "",  "預算金額（純數字或含逗號）",           "1,500,000"],
                  ["專家評論",      "",  "專家審核意見",                         "符合採購規範"],
                  ["審核處置",      "",  "通過 或 退件（決定最終狀態）",         "通過"],
                  ["派送日期",      "",  "格式 YYYY-MM-DD 或 YYYY/MM/DD",       "2024-03-15"],
                  ["簽核日期",      "",  "格式同上",                             "2024-03-18"],
                  ["Cycle time",    "",  "天數（整數或含「天」字）",             "3"],
                  ["備註",          "",  "補充說明",                             "—"],
                ].map(([col, req, desc, ex]) => (
                  <tr key={col}>
                    <td><code style={{ fontSize: 12 }}>{col}</code></td>
                    <td style={{ textAlign: "center", color: req ? "var(--accent)" : "var(--text-muted)", fontWeight: req ? 700 : 400 }}>{req || "—"}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{desc}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--text-subtle)", fontSize: 12 }}>{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            💡 Excel 若有多個工作表，匯入時會顯示選擇視窗。「目前關卡」欄位不需要，匯入後狀態由「審核處置」自動決定（通過→CLOSED，退件→REJECTED）。
          </div>
        </div>
      </div>

      {/* ── Quick reference: Status lifecycle ── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-head"><h3>狀態說明</h3></div>
        <div className="card-body tight">
          {[
            ["AI_REVIEW",      "#7c3aed", "待派發",    "AI 初審完成，等待管理員指定專家"],
            ["EXPERT_REVIEW",  "#06b6d4", "待專家審核", "已派發給專家，等待專家填寫評論"],
            ["PENDING_ACTION", "#f59e0b", "退回補件",   "專家退件，等待申請人補充資料後重送"],
            ["CLOSED",         "#10b981", "已簽核完成", "管理員簽核通過，結案"],
            ["REJECTED",       "#ef4444", "已退件",     "案件最終退件"],
          ].map(([s, col, label, desc]) => (
            <div key={s} style={{ display: "grid", gridTemplateColumns: "130px 100px 1fr", alignItems: "center",
                                   padding: "10px 14px", borderBottom: "1px solid var(--border)", gap: 12, fontSize: 13 }}>
              <div><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4,
                                   background: col + "22", color: col, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em" }}>{s}</span></div>
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sheet picker modal ── */}
      {sheetModal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 300,
                      display: "grid", placeItems: "center" }}
             onClick={e => e.target === e.currentTarget && setSheetModal(null)}>
          <div className="card" style={{ width: 380, maxWidth: "92vw", padding: 0 }}>
            <div className="card-head" style={{ padding: "16px 20px" }}>
              <h3>選擇工作表</h3>
              <button className="btn ghost sm" onClick={() => setSheetModal(null)}>✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                此 Excel 包含多個工作表，請選擇要匯入的工作表：
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {sheetModal.sheets.map(s => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                                          borderRadius: "var(--radius-sm)", cursor: "pointer",
                                          background: sheetModal.selected === s ? "var(--accent-soft)" : "var(--surface-2)",
                                          border: `1px solid ${sheetModal.selected === s ? "var(--accent)" : "var(--border)"}` }}>
                    <input type="radio" name="sheet" value={s} checked={sheetModal.selected === s}
                           onChange={() => setSheetModal(m => ({ ...m, selected: s }))}
                           style={{ accentColor: "var(--accent)" }}/>
                    <span style={{ fontSize: 13, fontWeight: sheetModal.selected === s ? 600 : 400 }}>{s}</span>
                  </label>
                ))}
              </div>
              <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button className="btn ghost" onClick={() => setSheetModal(null)}>取消</button>
                <button className="btn primary" onClick={doImportSheet} disabled={busy}>
                  {busy ? "匯入中…" : "確認匯入"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

Object.assign(window, { LibraryPage, AssignmentPage, PermissionsPage, ActivityPage, DataImportPage });
