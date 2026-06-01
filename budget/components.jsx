/* Shared components: icons, sidebar, topbar, badges */

const Icon = {
  Logo: () => <span>P</span>,
  Inbox: ({ s = 16 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>,

  Check: ({ s = 16 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </svg>,

  Book: ({ s = 16 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>,

  Users: ({ s = 16 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>,

  Shield: ({ s = 16 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>,

  Search: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>,

  Bell: ({ s = 16 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>,

  Plus: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>,

  Filter: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>,

  Download: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>,

  Upload: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>,

  Back: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>,

  Logout: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>,

  More: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
    </svg>,

  Refresh: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>,

  Sparkles: ({ s = 14 }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>

};

function StatusBadge({ status }) {
  const map = {
    // DB status values (v1.2 spec)
    AI_REVIEW:      { cls: "purple", label: "AI 初審中" },
    EXPERT_REVIEW:  { cls: "cyan",   label: "專家審核中" },
    PENDING_ACTION: { cls: "warn",   label: "待補件" },
    CLOSED:         { cls: "ok",     label: "已結案" },
    REJECTED:       { cls: "bad",    label: "已退件" },
  };
  const s = map[status] || { cls: "muted", label: status || "—" };
  return <span className={`badge ${s.cls}`}><span className="b-dot" />{s.label}</span>;
}

function ResultBadge({ result, kind }) {
  if (!result) return <span className="badge muted">—</span>;
  const map = {
    approve: { cls: "ok", label: kind === "ai" ? "AI 建議核可" : "核可" },
    reject: { cls: "bad", label: kind === "ai" ? "AI 建議退回" : "退回" },
    hold: { cls: "warn", label: "AI 無法判定" }
  };
  const s = map[result];
  return <span className={`badge ${s.cls}`}><span className="b-dot" />{s.label}</span>;
}

function Conf({ value }) {
  const v = value / 100;
  const tier = v >= 0.8 ? "hi" : v >= 0.6 ? "md" : "lo";
  return (
    <span className={`conf ${tier}`}>
      <span className="bar"><i style={{ width: `${value}%` }} /></span>
      {value}%
    </span>);

}

function CycleTag({ disp, sign }) {
  const c = MOCK.cycleTime(disp, sign);
  if (!c) return <span className="cyc">—</span>;
  return <span className={`cyc ${c.fast ? "fast" : c.slow ? "slow" : ""}`}>⏱ {c.label}</span>;
}

function OwnerCell({ owner }) {
  return (
    <span className="owner-cell">
      <span className="av">{owner.initial}</span>
      <span className="who">
        <div className="nm">{owner.name}</div>
        <div className="dp">{owner.dept}</div>
      </span>
    </span>);

}

function fmtAmount(n) {
  return new Intl.NumberFormat("zh-TW").format(n);
}

function Sidebar({ route, setRoute, pendingCount, width, onResize, user }) {
  const role = user?.role || "viewer";

  const allItems = [
    { id: "pending",     label: "待簽核",          icon: <Icon.Inbox />,  count: pendingCount, dot: true,  roles: ["admin","expert","viewer"] },
    { id: "approved",    label: "已簽核完成",       icon: <Icon.Check />,                        roles: ["admin","expert","viewer"] },
    { id: "library",     label: "AI Agent 圖書館",  icon: <Icon.Book />,                         roles: ["admin","expert","viewer"] },
    { id: "assignment",  label: "派發中心人員設定",  icon: <Icon.Users />,                        roles: ["admin"] },
    { id: "permissions", label: "權限管理中心",      icon: <Icon.Shield />,                       roles: ["admin"] },
  ];

  const items = allItems.filter(it => it.roles.includes(role));


  const handleRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);

  const onMouseDown = (e) => {
    e.preventDefault();
    setDragging(true);
    document.body.classList.add("is-resizing");
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev) => {
      const next = Math.min(360, Math.max(72, startW + (ev.clientX - startX)));
      onResize(next);
    };
    const onUp = () => {
      setDragging(false);
      document.body.classList.remove("is-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const narrow = width < 140;

  return (
    <aside className={`sidebar ${narrow ? "narrow" : ""}`}>
      <div className="sidebar-brand">
        <div className="mark">p</div>
        {!narrow &&
        <div className="title">
            pensieve
            <small>budget memory · 2026</small>
          </div>
        }
      </div>
      {!narrow && <div className="sidebar-section">主功能</div>}
      <nav className="sidebar-nav">
        {items.map((it) => {
          const active = route === it.id || it.id === "pending" && (route === "detail" || route === "edit" || route === "new");
          return (
            <div key={it.id} className={`nav-item ${active ? "active" : ""}`} onClick={() => setRoute(it.id)} title={narrow ? it.label : ""}>
              <span className="icon">{it.icon}</span>
              {!narrow && <span className="label-text">{it.label}</span>}
              {!narrow && it.count != null && <span className="count">{it.count}</span>}
              {it.dot && it.count > 0 && <span className="red-dot" />}
            </div>);

        })}
      </nav>
      <div className="sidebar-foot">
        <div className="avatar">{user?.name?.charAt(0) || "?"}</div>
        {!narrow &&
        <>
            <div className="who">
              <div className="n">{user?.name || "—"}</div>
              <div className="r">{role} · {user?.department || ""}</div>
            </div>
            <button className="logout" title="登出" onClick={() => window.dispatchEvent(new CustomEvent("app:logout"))}>
              <Icon.Logout />
            </button>
          </>
        }
      </div>
      <div
        ref={handleRef}
        className={`sidebar-resize ${dragging ? "dragging" : ""}`}
        onMouseDown={onMouseDown}
        onDoubleClick={() => onResize(240)}
        title="拖曳調整寬度，雙擊重設" />
      
    </aside>);

}

function Topbar({ crumbs, pendingCount }) {
  const now = MOCK.fmtDate(new Date());
  return (
    <div className="topbar">
      <div className="crumb">
        <span className="root">pensieve</span>
        <span className="sep">/</span>
        {crumbs.map((c, i) =>
        <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? "current" : ""}>{c}</span>
          </React.Fragment>
        )}
      </div>
      <div className="spacer" />
      <div className="meta">
        <span><span className="dot" />系統運作正常</span>
        <span className="mono">{now}</span>
      </div>
      <button className="icon-btn" title="通知">
        <Icon.Bell />
        {pendingCount > 0 && <span className="red-dot" />}
      </button>
    </div>);

}

function CategoryChip({ id, name }) {
  return (
    <span className={`cat-chip ${id}`}>
      <span className="cdot" />
      {name || id}
    </span>);

}

Object.assign(window, { Icon, StatusBadge, ResultBadge, Conf, CycleTag, OwnerCell, CategoryChip, fmtAmount, Sidebar, Topbar });