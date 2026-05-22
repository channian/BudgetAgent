/* Main app shell + routing */

function App() {
  const [user, setUser] = React.useState(null);
  const [route, setRoute] = React.useState("pending");
  const [budgets, setBudgets] = React.useState(() => MOCK.generateBudgets());
  const [currentBudget, setCurrentBudget] = React.useState(null);

  // Sidebar width (resizable + persisted)
  const [sidebarW, setSidebarW] = React.useState(() => {
    try { return Number(localStorage.getItem("pensieve.sidebarW")) || 240; } catch { return 240; }
  });
  React.useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", `${sidebarW}px`);
    try { localStorage.setItem("pensieve.sidebarW", String(sidebarW)); } catch {}
  }, [sidebarW]);

  // Tweaks
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accentColor": "#E85D5D",
    "density": "regular",
    "showGrid": true,
    "preLoggedIn": false
  }/*EDITMODE-END*/;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply accent color (hex)
  React.useEffect(() => {
    const root = document.documentElement;
    const hex = t.accentColor || "#2BA8C7";
    // Build soft & strong variants in oklch via mix
    root.style.setProperty("--accent", hex);
    root.style.setProperty("--accent-strong", `color-mix(in oklch, ${hex} 80%, black)`);
    root.style.setProperty("--accent-soft", `color-mix(in oklch, ${hex} 14%, white)`);
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

  React.useEffect(() => {
    if (t.preLoggedIn && !user) setUser("liao.jianxun");
  }, [t.preLoggedIn]);

  React.useEffect(() => {
    const h = () => setUser(null);
    window.addEventListener("app:logout", h);
    return () => window.removeEventListener("app:logout", h);
  }, []);

  const pendingCount = budgets.filter((b) => b.status === "in_review" || b.status === "new").length;

  const openDetail = (b) => { setCurrentBudget(b); setRoute("detail"); };
  const goNew = () => { setCurrentBudget(null); setRoute("new"); };
  const goEdit = (b) => { setCurrentBudget(b); setRoute("edit"); };
  const goList = () => setRoute("pending");

  const approve = (b, comment) => {
    setBudgets((arr) => arr.map((x) => x.id === b.id ? { ...x, expertResult: "approve", expertComment: comment, status: "approved", signDate: new Date() } : x));
    setRoute("pending");
  };
  const reject = (b, comment) => {
    setBudgets((arr) => arr.map((x) => x.id === b.id ? { ...x, expertResult: "reject", expertComment: comment, status: "rejected", signDate: new Date() } : x));
    setRoute("pending");
  };
  const saveNew = (data) => {
    // For demo: just route back
    setRoute("pending");
  };

  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)}/>;
  }

  let crumbs = ["待簽核"];
  let body = null;
  if (route === "pending") {
    body = <ListPage scope="pending" budgets={budgets} onRow={openDetail} onNew={goNew} onRefresh={() => setBudgets(MOCK.generateBudgets())}/>;
    crumbs = ["待簽核"];
  } else if (route === "approved") {
    body = <ListPage scope="approved" budgets={budgets} onRow={openDetail} onNew={goNew} onRefresh={() => {}}/>;
    crumbs = ["已簽核完成"];
  } else if (route === "library") {
    body = <LibraryPage/>;
    crumbs = ["AI Agent 圖書館"];
  } else if (route === "assignment") {
    body = <AssignmentPage/>;
    crumbs = ["派發中心人員設定"];
  } else if (route === "permissions") {
    body = <PermissionsPage/>;
    crumbs = ["權限管理中心"];
  } else if (route === "detail" && currentBudget) {
    body = <DetailPage budget={currentBudget} onBack={goList} onApprove={approve} onReject={reject} onEdit={goEdit}/>;
    crumbs = ["待簽核", currentBudget.id];
  } else if (route === "edit" && currentBudget) {
    body = <EditPage budget={currentBudget} onBack={() => setRoute("detail")} onSave={saveNew}/>;
    crumbs = ["待簽核", currentBudget.id, "編輯"];
  } else if (route === "new") {
    body = <EditPage budget={null} onBack={goList} onSave={saveNew}/>;
    crumbs = ["待簽核", "建立新預算單"];
  }

  return (
    <>
      <div className="app">
        <Sidebar route={route} setRoute={(r) => { setRoute(r); }} pendingCount={pendingCount} width={sidebarW} onResize={setSidebarW}/>
        <div className="col-right">
          <Topbar crumbs={crumbs} pendingCount={pendingCount}/>
          <main className={`main ${(route === "pending" || route === "approved") ? "fit" : ""}`}>{body}</main>
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
          <TweakToggle label="顯示背景網格" value={t.showGrid} onChange={(v) => setTweak("showGrid", v)}/>
          <TweakRadio
            label="密度"
            value={t.density}
            options={["compact", "regular"]}
            onChange={(v) => setTweak("density", v)}
          />
        </TweakSection>
        <TweakSection label="Demo">
          <TweakToggle label="預設已登入" value={t.preLoggedIn} onChange={(v) => setTweak("preLoggedIn", v)}/>
          <TweakButton label="重新產生案件資料" onClick={() => { setBudgets(MOCK.generateBudgets()); setRoute("pending"); }}/>
          <TweakButton label="回到登入頁" secondary onClick={() => { setUser(null); }}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// Density effect
const densityStyle = document.createElement("style");
document.head.appendChild(densityStyle);

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
