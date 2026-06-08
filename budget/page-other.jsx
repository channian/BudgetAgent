/* Library / Assignment / Permissions pages */

const DISPOSITIONS = ["通過", "退件", "不適用"];
const EMPTY_ENTRY  = { title: "", keywords: "", content: "", example: "", disposition: "", note: "" };

function LibraryPage({ currentUser }) {
  const role    = currentUser?.role || "viewer";
  const isAdmin = role === "admin";

  const [systems, setSystems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState("");
  const [active,  setActive]  = React.useState(null);   // selected system → RAG detail

  // system create/rename modal: null | "new" | system-object
  const [sysModal, setSysModal] = React.useState(null);
  const [sysForm,  setSysForm]  = React.useState({ name: "", description: "" });
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

  const openNewSys  = () => { setSysForm({ name: "", description: "", expert_name: "" }); setSysErr(""); setSysModal("new"); };
  const openEditSys = (s) => { setSysForm({ name: s.name, description: s.description || "", expert_name: s.expert_name || "" }); setSysErr(""); setSysModal(s); };
  const closeSys    = () => setSysModal(null);

  const saveSys = async () => {
    if (!sysForm.name.trim()) { setSysErr("系統名稱為必填"); return; }
    setSysBusy(true); setSysErr("");
    try {
      if (sysModal === "new") await API.createRagSystem(sysForm);
      else                    await API.updateRagSystem(sysModal.id, sysForm);
      closeSys();
      load();
    } catch (e) { setSysErr(e.message); }
    finally     { setSysBusy(false); }
  };

  const deleteSys = async (s) => {
    if (!confirm(`確定刪除「${s.name}」？此系統下所有 RAG 資料將一併刪除。`)) return;
    try { await API.deleteRagSystem(s.id); load(); }
    catch (e) { alert("刪除失敗：" + e.message); }
  };

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
          {isAdmin && <button className="btn accent" onClick={openNewSys}><Icon.Plus/>新增系統類別</button>}
        </div>
      </div>

      {err && <div style={{ padding: "8px 0", color: "var(--bad)", fontSize: 13 }}>⚠ {err}</div>}

      {loading ? (
        <div className="empty">載入中…</div>
      ) : systems.length === 0 ? (
        <div className="empty">尚無系統類別{isAdmin ? "，請點右上角「新增系統類別」" : ""}</div>
      ) : (
        <div className="sys-grid">
          {systems.map((s) => (
            <div key={s.id} className="sys-card" onClick={() => setActive(s)}>
              <div className="sys-card-top">
                <div className="sys-av"><Icon.Book s={18}/></div>
                {isAdmin && (
                  <div className="sys-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn ghost sm" title="重新命名" onClick={() => openEditSys(s)}>✎</button>
                    <button className="btn ghost sm" title="刪除" onClick={() => deleteSys(s)}>✕</button>
                  </div>
                )}
              </div>
              <h4 className="sys-name">{s.name}</h4>
              {s.description && <div className="sys-desc">{s.description}</div>}
              <div className="sys-meta">
                {s.expert_name && (
                  <span className="sys-expert">👤 {s.expert_name}</span>
                )}
                <span className="sys-count">{s.entry_count}</span> 筆 RAG 資料
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── System create / rename modal ── */}
      {sysModal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 200, display: "grid", placeItems: "center" }}
             onClick={e => e.target === e.currentTarget && closeSys()}>
          <div className="card" style={{ width: 420, maxWidth: "92vw", padding: 0 }}>
            <div className="card-head" style={{ padding: "16px 20px" }}>
              <h3>{sysModal === "new" ? "新增系統類別" : `重新命名：${sysModal.name}`}</h3>
              <button className="btn ghost sm" onClick={closeSys}>✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>系統名稱 <span className="req">*</span></label>
                <input type="text" value={sysForm.name} autoFocus
                  onChange={e => setSysForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例：ERP 採購系統"/>
              </div>
              <div className="field">
                <label>說明（選填）</label>
                <input type="text" value={sysForm.description}
                  onChange={e => setSysForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="此系統類別的用途簡述"/>
              </div>
              <div className="field">
                <label>負責專家（選填）</label>
                <input type="text" value={sysForm.expert_name}
                  onChange={e => setSysForm(f => ({ ...f, expert_name: e.target.value }))}
                  placeholder="例：王小明"/>
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

function RagSystemDetail({ system, currentUser, onBack }) {
  const role     = currentUser?.role || "viewer";
  const canWrite = role !== "viewer";

  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState("");

  // filters
  const [q,    setQ]    = React.useState("");
  const [disp, setDisp] = React.useState("");

  // entry modal: null | "new" | entry-object
  const [modal,  setModal]  = React.useState(null);
  const [form,   setForm]   = React.useState(EMPTY_ENTRY);
  const [busy,   setBusy]   = React.useState(false);
  const [mErr,   setMErr]   = React.useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    API.fetchRagEntries(system.id, { q, disposition: disp })
      .then(rows => { setEntries(rows); setErr(""); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [system.id, q, disp]);

  // Debounced reload on filter change
  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openNew  = () => { setForm(EMPTY_ENTRY); setMErr(""); setModal("new"); };
  const openEdit = (en) => {
    setForm({ title: en.title || "", keywords: en.keywords || "", content: en.content || "",
              example: en.example || "", disposition: en.disposition || "", note: en.note || "" });
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
          <div className="flex-row" style={{ marginBottom: 8 }}>
            <button className="btn ghost sm" onClick={onBack}><Icon.Back/>返回圖書館</button>
            <span className="tag-sm">RAG 知識庫</span>
          </div>
          <h2 style={{ marginBottom: 2 }}>{system.name}</h2>
          <div className="lede">{system.description || "管理此系統的 AI 審核規則與案例，供專家建立與查詢"}</div>
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
        <div className="card-body tight">
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
                  <label>建議處置</label>
                  <select value={form.disposition} onChange={e => set("disposition", e.target.value)}>
                    <option value="">— 不指定 —</option>
                    {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>備註 <span className="opt">(選填)</span></label>
                  <input type="text" value={form.note} onChange={e => set("note", e.target.value)} placeholder="其他補充"/>
                </div>
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

function AssignmentPage() {
  const [aiCases,     setAiCases]     = React.useState([]);
  const [dispatched,  setDispatched]  = React.useState([]);
  const [loading,     setLoading]     = React.useState(true);
  const [experts,     setExperts]     = React.useState([]);
  const [forms,       setForms]       = React.useState({});   // {dbId: {budget_no, expert_name}}
  const [dispatching, setDispatching] = React.useState({});   // {dbId: true}
  const [doneInfo,    setDoneInfo]    = React.useState({});   // {dbId: updatedBudget}
  const [errMsg,      setErrMsg]      = React.useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [pending, completed, users] = await Promise.all([
        API.fetchBudgets("pending"),
        API.fetchBudgets("completed"),
        API.fetchUsers(),
      ]);
      const ai   = pending.filter(b => b.status === "AI_REVIEW");
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
        <div className="card-body tight">
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
          <span className="hint">{dispatched.length} 件</span>
        </div>
        <div className="card-body tight">
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
              </div>
              {dispatched.map(b => (
                <div key={b.dbId} className="sent-row">
                  <div><span className="week-pill">W{String(b.week).padStart(2, "0")}</span></div>
                  <div className="nm" title={b.project}>{b.project}</div>
                  <div className="mono" style={{ fontSize: 12 }}>{b.budgetNo || <span style={{ color: "var(--text-muted)" }}>—</span>}</div>
                  <div>{b.expertName || <span style={{ color: "var(--text-muted)" }}>未指定</span>}</div>
                  <div className="mono" style={{ fontSize: 12 }}>{fmtDate(b.dispatchDate)}</div>
                  <div><StatusBadge status={b.status}/></div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const ROLE_LABELS = { admin: "系統管理員", expert: "專家複審", viewer: "檢視者" };
const ROLE_COLORS = { admin: "var(--bad)", expert: "var(--accent)", viewer: "var(--text-muted)" };

const EMPTY_FORM = { name: "", ad_account: "", department: "", email: "", role: "viewer" };

function PermissionsPage() {
  const [users,   setUsers]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState("");

  // Modal state: null = closed, "new" = create, user-object = edit
  const [modal,   setModal]   = React.useState(null);
  const [form,    setForm]    = React.useState(EMPTY_FORM);
  const [saving,  setSaving]  = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");

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
        <div className="card-body tight">
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
        <div className="card-body tight">
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

Object.assign(window, { LibraryPage, AssignmentPage, PermissionsPage, ActivityPage });
