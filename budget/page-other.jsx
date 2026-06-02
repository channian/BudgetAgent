/* Library / Assignment / Permissions pages */

function LibraryPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>AI Agent 圖書館</h2>
          <div className="lede">集中管理派發中心可調用的 AI 模型與規則</div>
        </div>
        <div className="actions">
          <button className="btn"><Icon.Filter/>篩選</button>
          <button className="btn accent"><Icon.Plus/>註冊新 Agent</button>
        </div>
      </div>

      <div className="agent-grid">
        {MOCK.AGENTS.map((a) => (
          <div key={a.id} className="agent-card">
            <div className="head">
              <div className="av">{a.id}</div>
              <div className="meta">
                <h4>{a.name}</h4>
                <div className="ver">{a.ver} · ONLINE</div>
              </div>
              <span className="badge ok"><span className="b-dot"/>運行中</span>
            </div>
            <div className="desc">{a.desc}</div>
            <div className="stats">
              <span><b>{a.calls}</b>近 30 日呼叫</span>
              <span><b>{a.acc}</b>準確率</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AssignmentPage() {
  const [cases,       setCases]       = React.useState([]);
  const [loading,     setLoading]     = React.useState(true);
  const [experts,     setExperts]     = React.useState([]);
  const [forms,       setForms]       = React.useState({});   // {dbId: {budget_no, expert_name}}
  const [dispatching, setDispatching] = React.useState({});   // {dbId: true}
  const [done,        setDone]        = React.useState({});   // {dbId: true}
  const [errMsg,      setErrMsg]      = React.useState({});   // {dbId: "error"}

  const load = async () => {
    setLoading(true);
    try {
      const [data, users] = await Promise.all([
        API.fetchBudgets("pending"),
        API.fetchUsers(),
      ]);
      const ai = data.filter(b => b.status === "AI_REVIEW");
      setCases(ai);
      setExperts(users.filter(u => u.role === "expert"));
      const init = {};
      ai.forEach(b => { init[b.dbId] = { budget_no: b.budgetNo || "", expert_name: b.expertName || "" }; });
      setForms(init);
      setDone({}); setErrMsg({});
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
    setDispatching(d => ({ ...d, [b.dbId]: true }));
    setErrMsg(e => { const n = { ...e }; delete n[b.dbId]; return n; });
    try {
      await API.dispatch(b.dbId, forms[b.dbId] || {});
      setDone(d => ({ ...d, [b.dbId]: true }));
      setTimeout(() => {
        setCases(cs => cs.filter(c => c.dbId !== b.dbId));
        setDone(d => { const n = { ...d }; delete n[b.dbId]; return n; });
      }, 1800);
    } catch (e) {
      setErrMsg(err => ({ ...err, [b.dbId]: e.message }));
    } finally {
      setDispatching(d => ({ ...d, [b.dbId]: false }));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>派發中心</h2>
          <div className="lede">為 AI 初審完成的案件填入預算單號與負責專家，派發後進入專家審核流程</div>
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

      <div className="card">
        <div className="card-head">
          <h3>待派發案件 <span className="tag">AI_REVIEW</span></h3>
          <span className="hint">{loading ? "載入中…" : `${cases.length} 件待派發`}</span>
        </div>
        <div className="card-body tight">
          {loading ? (
            <div className="empty">載入中…</div>
          ) : cases.length === 0 ? (
            <div className="empty">🎉 目前沒有待派發案件</div>
          ) : (
            <>
              <div className="dispatch-row head">
                <div>週</div>
                <div>項目名稱</div>
                <div>類別</div>
                <div>金額</div>
                <div>預算單號</div>
                <div>負責專家</div>
                <div></div>
              </div>
              {cases.map(b => {
                const f      = forms[b.dbId] || {};
                const isDone = done[b.dbId];
                const isBusy = dispatching[b.dbId];
                const err    = errMsg[b.dbId];
                return (
                  <div key={b.dbId} className={`dispatch-row ${isDone ? "dispatched" : ""}`}>
                    <div><span className="week-pill">W{String(b.week).padStart(2, "0")}</span></div>
                    <div className="nm" title={b.project}>{b.project}</div>
                    <div><CategoryChip id={b.categoryId} name={b.category}/></div>
                    <div className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
                      NT$ {fmtAmount(b.amount)}
                    </div>
                    <div>
                      <input
                        className="cell-input"
                        placeholder="填入預算單號"
                        value={f.budget_no || ""}
                        onChange={e => setField(b.dbId, "budget_no", e.target.value)}
                        disabled={isDone || isBusy}
                      />
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
                      {isDone
                        ? <span className="badge ok" style={{ whiteSpace: "nowrap" }}>✓ 已派發</span>
                        : <button
                            className="btn sm accent"
                            onClick={() => doDispatch(b)}
                            disabled={isBusy}
                          >{isBusy ? "派發中…" : "派發"}</button>
                      }
                      {err && <span style={{ fontSize: 10.5, color: "var(--bad)" }}>{err}</span>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const ROLE_LABELS = { admin: "系統管理員", expert: "專家複審", viewer: "檢視者" };
const ROLE_COLORS = { admin: "var(--bad)", expert: "var(--accent)", viewer: "var(--text-muted)" };

const EMPTY_FORM = { name: "", ad_account: "", department: "", email: "", role: "viewer", password: "" };

function PermissionsPage() {
  const [users,   setUsers]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err,     setErr]     = React.useState("");

  // Modal state: null = closed, "new" = create, user-object = edit
  const [modal,   setModal]   = React.useState(null);
  const [form,    setForm]    = React.useState(EMPTY_FORM);
  const [saving,  setSaving]  = React.useState(false);
  const [saveErr, setSaveErr] = React.useState("");

  // Password reset sub-form
  const [pwdUserId, setPwdUserId] = React.useState(null);
  const [newPwd,    setNewPwd]    = React.useState("");
  const [pwdMsg,    setPwdMsg]    = React.useState("");

  const load = () => {
    setLoading(true);
    API.fetchUsers()
      .then(rows => { setUsers(rows); setErr(""); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, []);

  const openNew  = () => { setForm(EMPTY_FORM); setSaveErr(""); setModal("new"); };
  const openEdit = (u) => { setForm({ name: u.name, ad_account: u.ad_account, department: u.department || "", email: u.email || "", role: u.role, password: "" }); setSaveErr(""); setModal(u); };
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
        if (form.password) await API.resetPassword(modal.id, form.password);
      }
      closeModal();
      load();
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetPwd = async (userId) => {
    if (!newPwd.trim()) { setPwdMsg("請輸入密碼"); return; }
    try {
      await API.resetPassword(userId, newPwd);
      setNewPwd(""); setPwdUserId(null); setPwdMsg("✅ 密碼已更新");
      setTimeout(() => setPwdMsg(""), 3000);
    } catch (e) {
      setPwdMsg("❌ " + e.message);
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
      {pwdMsg && <div style={{ padding: "8px 0", color: "var(--ok)", fontSize: 13 }}>{pwdMsg}</div>}

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
                {pwdUserId === u.id ? (
                  <>
                    <input
                      type="password"
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      placeholder="新密碼"
                      style={{ width: 120, fontSize: 12, padding: "3px 7px", border: "1px solid var(--border)", borderRadius: 4 }}
                    />
                    <button className="btn sm" onClick={() => resetPwd(u.id)}>確認</button>
                    <button className="btn sm ghost" onClick={() => { setPwdUserId(null); setNewPwd(""); }}>取消</button>
                  </>
                ) : (
                  <>
                    <button className="btn sm ghost" onClick={() => { setPwdUserId(u.id); setNewPwd(""); }}>重設密碼</button>
                    <button className="btn sm" onClick={() => openEdit(u)}>編輯</button>
                  </>
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
                  <label>AD 帳號 <span className="req">*</span></label>
                  <input type="text" value={form.ad_account} onChange={e => set("ad_account", e.target.value)}
                    placeholder="例：john.doe" disabled={modal !== "new"}
                    style={{ opacity: modal !== "new" ? 0.5 : 1 }}/>
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="text" value={form.email} onChange={e => set("email", e.target.value)} placeholder="選填"/>
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
                <div className="field">
                  <label>{modal === "new" ? "初始密碼" : "重設密碼（選填）"}</label>
                  <input type="password" value={form.password} onChange={e => set("password", e.target.value)}
                    placeholder={modal === "new" ? "留空則帳號無法登入" : "不修改請留空"}/>
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

Object.assign(window, { LibraryPage, AssignmentPage, PermissionsPage });
