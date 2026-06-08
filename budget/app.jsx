/* Main app shell + routing */

function App() {
  const [user, setUser]               = React.useState(null);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [route, setRoute]             = React.useState("pending");
  const [fromRoute, setFromRoute]     = React.useState("pending");
  const [budgets, setBudgets]         = React.useState([]);
  const [loading, setLoading]         = React.useState(false);
  const [apiError, setApiError]       = React.useState(null);
  const [currentBudget, setCurrentBudget] = React.useState(null);
  const [notifs, setNotifs]               = React.useState([]);

  // Sidebar width (resizable + persisted) + collapse toggle
  const [sidebarW, setSidebarW] = React.useState(() => {
    try { return Number(localStorage.getItem("pensieve.sidebarW")) || 240; } catch { return 240; }
  });
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const w = collapsed ? 56 : sidebarW;
    document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    if (!collapsed) {
      try { localStorage.setItem("pensieve.sidebarW", String(sidebarW)); } catch {}
    }
  }, [sidebarW, collapsed]);

  // Tweaks
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accentColor": "#E85D5D",
    "density": "regular",
    "showGrid": true,
    "preLoggedIn": false
  }/*EDITMODE-END*/;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    const root = document.documentElement;
    const hex  = t.accentColor || "#2BA8C7";
    root.style.setProperty("--accent",        hex);
    root.style.setProperty("--accent-strong", `color-mix(in oklch, ${hex} 80%, black)`);
    root.style.setProperty("--accent-soft",   `color-mix(in oklch, ${hex} 14%, white)`);
  }, [t.accentColor]);

  React.useEffect(() => {
    document.body.style.backgroundImage = t.showGrid
      ? "radial-gradient(circle at 1px 1px, var(--bg-grid) 1px, transparent 0)"
      : "none";
  }, [t.showGrid]);

  React.useEffect(() => {
    if (t.density === "compact") {
      densityStyle.textContent = `
        table.dt tbody td { padding: 6px 12px; }
        table.dt thead th { padding: 6px 12px; }
        .card-body { padding: 12px; }
        .kpi { padding: 10px 14px; }
        .kpi .val { font-size: 20px; }
        .main { padding: 16px 20px 60px; gap: 12px; }
        .kv { padding: 8px 14px; }
      `;
    } else {
      densityStyle.textContent = "";
    }
  }, [t.density]);

  // Check existing session on mount
  React.useEffect(() => {
    API.me()
      .then(u => { setUser(u); setAuthChecked(true); })
      .catch(() => setAuthChecked(true));
  }, []);

  // Logout event
  React.useEffect(() => {
    const h = async () => { await API.logout().catch(() => {}); setUser(null); };
    window.addEventListener("app:logout", h);
    return () => window.removeEventListener("app:logout", h);
  }, []);

  // Fetch notifications and poll every 60 s
  React.useEffect(() => {
    if (!user) return;
    const fetchNotifs = () =>
      API.fetchNotifications()
         .then(data => setNotifs(data))
         .catch(() => {});
    fetchNotifs();
    const tid = setInterval(fetchNotifs, 60000);
    return () => clearInterval(tid);
  }, [user]);

  const markNotifRead = async (id) => {
    try {
      await API.markRead(id);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    } catch {}
  };

  const markAllRead = async () => {
    const unread = notifs.filter(n => !n.read_at);
    await Promise.all(unread.map(n => API.markRead(n.id).catch(() => {})));
    setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  };

  // Load budgets whenever user or list route changes
  const loadBudgets = React.useCallback(async (targetScope) => {
    const scope = targetScope || "pending";
    setLoading(true);
    setApiError(null);
    try {
      const data = await API.fetchBudgets(scope);
      setBudgets(data);
    } catch (e) {
      if (e.message.includes("401") || e.message.includes("未登入")) {
        setUser(null);
      } else {
        setApiError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (user && (route === "pending" || route === "approved" || route === "expert_review")) {
      loadBudgets(route === "approved" ? "completed" : "pending");
    }
  }, [user, route]);

  // Badge counts
  const hasComment = (b) => !!(b.expertComment && b.expertComment.trim());
  // 待簽核 = only dispatched cases with expert comment ready for admin to sign
  const pendingCount = budgets.filter(b =>
    (b.status === "EXPERT_REVIEW" || b.status === "PENDING_ACTION") && hasComment(b)
  ).length;
  // 待專家審核 = dispatched cases without expert comment yet
  const expertReviewCount = budgets.filter(b =>
    (b.status === "EXPERT_REVIEW" || b.status === "PENDING_ACTION") && !hasComment(b)
  ).length;

  const openDetail = (b, source) => {
    setCurrentBudget(b);
    setFromRoute(source || route);
    setRoute("detail");
  };
  const goNew      = ()  => { setCurrentBudget(null); setFromRoute(route); setRoute("new"); };
  const goEdit     = (b) => { setCurrentBudget(b); setRoute("edit"); };
  const goList     = ()  => {
    if (fromRoute === "expert_review") setRoute("expert_review");
    else if (fromRoute === "data_import") setRoute("data_import");
    else setRoute("pending");
  };

  const approve = async (b, comment) => {
    try {
      await API.approve(b.dbId, comment);
      goList();
    } catch (e) { setApiError(e.message); }
  };

  const reject = async (b, comment, final = false) => {
    try {
      await API.reject(b.dbId, comment, final);
      goList();
    } catch (e) { setApiError(e.message); }
  };

  const returnForSupplement = async (b, comment) => {
    try {
      await API.reject(b.dbId, comment, false);
      goList();
    } catch (e) { setApiError(e.message); }
  };

  const deleteBudget = async (b, reason) => {
    try {
      await API.deleteBudget(b.dbId, reason);
      await loadBudgets();
      setRoute("pending");
    } catch (e) { setApiError(e.message); }
  };

  const inlineSign = async (b) => {
    if (b.expertResult === "reject") await API.reject(b.dbId, "", true);
    else                             await API.approve(b.dbId, "");
  };

  const saveReview = async (b, comment, decision) => {
    try {
      await API.saveReview(b.dbId, { comment, decision });
      setRoute("pending");
    } catch (e) { setApiError(e.message); }
  };

  const saveNew = async (form) => {
    try {
      if (currentBudget) {
        await API.updateBudget(currentBudget.dbId, form);
      } else {
        await API.createBudget(form);
      }
      setRoute(fromRoute === "data_import" ? "data_import" : "pending");
    } catch (e) { setApiError(e.message); }
  };

  if (!authChecked) {
    return <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--text-muted)" }}>載入中…</div>;
  }

  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)} />;
  }

  let crumbs = ["待簽核"];
  let body   = null;

  if (route === "pending") {
    body   = <ListPage scope="pending" budgets={budgets} loading={loading} onRow={(b) => openDetail(b, "pending")} onNew={goNew} onRefresh={() => loadBudgets("pending")} currentUser={user} onSign={async (b) => { await inlineSign(b); loadBudgets("pending"); }} />;
    crumbs = ["待簽核"];
  } else if (route === "expert_review") {
    body   = <ListPage scope="expert_review" budgets={budgets} loading={loading} onRow={(b) => openDetail(b, "expert_review")} onNew={goNew} onRefresh={() => loadBudgets("pending")} currentUser={user} />;
    crumbs = ["待專家審核"];
  } else if (route === "approved") {
    body   = <ListPage scope="approved" budgets={budgets} loading={loading} onRow={(b) => openDetail(b, "approved")} onNew={goNew} onRefresh={() => loadBudgets("completed")} currentUser={user} />;
    crumbs = ["已簽核完成"];
  } else if (route === "library") {
    body   = <LibraryPage currentUser={user} />;
    crumbs = ["AI Agent 圖書館"];
  } else if (route === "data_import") {
    body   = <DataImportPage onNew={goNew} onRefresh={() => loadBudgets("pending")} currentUser={user} />;
    crumbs = ["前端資料導入"];
  } else if (route === "assignment") {
    body   = <AssignmentPage currentUser={user} />;
    crumbs = ["派發中心人員設定"];
  } else if (route === "permissions") {
    body   = <PermissionsPage currentUser={user} />;
    crumbs = ["權限管理中心"];
  } else if (route === "activity") {
    body   = <ActivityPage />;
    crumbs = ["使用狀況"];
  } else if (route === "detail" && currentBudget) {
    body   = <DetailPage budget={currentBudget} onBack={goList} onApprove={approve} onReject={reject} onReturn={returnForSupplement} onSaveReview={saveReview} onDelete={deleteBudget} onEdit={goEdit} currentUser={user} fromRoute={fromRoute} />;
    crumbs = [fromRoute === "expert_review" ? "待專家審核" : "待簽核", currentBudget.id];
  } else if (route === "edit" && currentBudget) {
    body   = <EditPage budget={currentBudget} onBack={() => setRoute("detail")} onSave={saveNew} currentUser={user} />;
    crumbs = ["待簽核", currentBudget.id, "編輯"];
  } else if (route === "new") {
    body   = <EditPage budget={null} onBack={goList} onSave={saveNew} currentUser={user} />;
    crumbs = ["待簽核", "建立新預算單"];
  }

  return (
    <>
      <div className="app">
        <Sidebar route={route} setRoute={(r) => setRoute(r)} pendingCount={pendingCount} expertReviewCount={expertReviewCount} fromRoute={fromRoute} width={sidebarW} onResize={setSidebarW} user={user} collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
        <div className="col-right">
          <Topbar crumbs={crumbs} notifs={notifs} onMarkRead={markNotifRead} onMarkAllRead={markAllRead} />
          {apiError && (
            <div style={{ padding: "8px 24px", background: "var(--bad-soft)", color: "oklch(0.45 0.18 22)", fontSize: 12, borderBottom: "1px solid oklch(0.6 0.2 22 / 0.2)" }}>
              ⚠ {apiError}
              <button onClick={() => setApiError(null)} style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 600 }}>✕</button>
            </div>
          )}
          <main className={`main ${(route === "pending" || route === "expert_review" || route === "approved") ? "fit" : ""}`}>{body}</main>
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="外觀">
          <TweakColor
            label="主題色"
            value={t.accentColor}
            options={["#E85D5D", "#D946A0", "#7C5AE0", "#2BA8C7", "#0EA5A0", "#F59E0B"]}
            onChange={(v) => setTweak("accentColor", v)}
          />
          <TweakToggle label="顯示背景網格" value={t.showGrid} onChange={(v) => setTweak("showGrid", v)} />
          <TweakRadio
            label="密度"
            value={t.density}
            options={["compact", "regular"]}
            onChange={(v) => setTweak("density", v)}
          />
        </TweakSection>
        <TweakSection label="Debug">
          <TweakButton label="從資料庫重新整理" onClick={() => { loadBudgets(); setRoute("pending"); }} />
          <TweakButton label="回到登入頁" secondary onClick={async () => { await API.logout().catch(() => {}); setUser(null); }} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

const densityStyle = document.createElement("style");
document.head.appendChild(densityStyle);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
