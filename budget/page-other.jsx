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
  const rules = [
    { cat: "研發費用 RD", agent: "BSV + VND", reviewer: "陳建宏 / 李怡君", th: "≥ NT$ 500K 升級至專家複審" },
    { cat: "行銷推廣 MKT", agent: "BSV + PLC", reviewer: "林淑芬 / 吳明達", th: "≥ NT$ 1M 升級至專家複審" },
    { cat: "資訊系統 IT", agent: "BSV + DUP + VND", reviewer: "黃志明 / 蔡心怡", th: "≥ NT$ 800K 升級至專家複審" },
    { cat: "人力資源 HR", agent: "BSV + PLC", reviewer: "張雅婷", th: "≥ NT$ 300K 升級至專家複審" },
    { cat: "營運支援 OPS", agent: "BSV", reviewer: "王俊傑", th: "≥ NT$ 200K 升級至專家複審" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h2>派發中心人員設定</h2>
          <div className="lede">設定不同類別的 AI 代理組合、複審人員與升級門檻</div>
        </div>
        <div className="actions">
          <button className="btn"><Icon.Refresh/>同步 HR 名單</button>
          <button className="btn accent"><Icon.Plus/>新增規則</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>派發規則 <span className="tag">DISPATCH RULES</span></h3>
          <span className="hint">{rules.length} 條 · 最後更新 2026-05-18 14:32</span>
        </div>
        <div className="card-body tight">
          <div className="user-row head">
            <div>類別</div>
            <div>AI Agent 組合</div>
            <div>專家複審名單</div>
            <div>升級門檻</div>
            <div style={{ textAlign: "right" }}>狀態</div>
          </div>
          {rules.map((r, i) => (
            <div className="user-row" key={i}>
              <div className="nm">
                <span className="tag-sm">{r.cat.split(" ")[1]}</span>
                <span>{r.cat.split(" ")[0]}</span>
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--accent-strong)" }}>{r.agent}</div>
              <div>{r.reviewer}</div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{r.th}</div>
              <div style={{ textAlign: "right" }}>
                <span className="toggle on" style={{ display: "inline-block", verticalAlign: "middle" }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>複審人員工作量 <span className="tag">LOAD</span></h3>
          <span className="hint">今日</span>
        </div>
        <div className="card-body tight">
          {MOCK.OWNERS.slice(0, 5).map((o, i) => {
            const load = [82, 64, 47, 31, 18][i];
            return (
              <div key={o.id} className="user-row" style={{ gridTemplateColumns: "200px 1fr 80px" }}>
                <div className="nm">
                  <div className="av">{o.initial}</div>
                  <div>
                    {o.name}
                    <small>{o.dept}</small>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <div style={{ width: `${load}%`, height: "100%", background: load > 70 ? "var(--warn)" : "var(--accent)" }}/>
                  </div>
                  <span className="mono" style={{ fontSize: 11, width: 36, textAlign: "right", color: "var(--text-muted)" }}>{load}%</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <button className="btn sm ghost"><Icon.More/></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function PermissionsPage() {
  const [tab, setTab] = React.useState("roles");
  const users = [
    { name: "廖建勳", id: "liao.jianxun", role: "expert", dept: "資訊處", last: "今日 09:42", active: true },
    { name: "陳建宏", id: "chen.jianhong", role: "owner", dept: "研發處", last: "今日 08:15", active: true },
    { name: "林淑芬", id: "lin.shufen", role: "owner", dept: "行銷部", last: "昨日 17:32", active: true },
    { name: "黃志明", id: "huang.zhiming", role: "expert", dept: "資訊處", last: "今日 10:01", active: true },
    { name: "張雅婷", id: "zhang.yating", role: "admin", dept: "人資部", last: "今日 09:58", active: true },
    { name: "王俊傑", id: "wang.junjie", role: "owner", dept: "營運處", last: "5 日前", active: false },
    { name: "李怡君", id: "li.yijun", role: "viewer", dept: "稽核室", last: "今日 09:11", active: true },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h2>權限管理中心</h2>
          <div className="lede">角色、人員及功能權限矩陣</div>
        </div>
        <div className="actions">
          <button className="btn"><Icon.Download/>匯出權限報表</button>
          <button className="btn accent"><Icon.Plus/>新增使用者</button>
        </div>
      </div>

      <div className="flex-row" style={{ gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
        {[
          { id: "roles", label: "角色定義" },
          { id: "users", label: "使用者列表" },
          { id: "audit", label: "存取稽核" },
        ].map((t) => (
          <button
            key={t.id}
            className="btn ghost"
            style={{
              borderRadius: 0,
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.id ? 500 : 400,
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "roles" && (
        <div className="agent-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {MOCK.ROLES.map((r) => (
            <div key={r.id} className="agent-card">
              <div className="head">
                <div className="av" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{r.id.slice(0, 2).toUpperCase()}</div>
                <div className="meta">
                  <h4>{r.name}</h4>
                  <div className="ver">{r.id} · {r.count} 名使用者</div>
                </div>
              </div>
              <div className="desc">{r.desc}</div>
              <div className="stats">
                {["建立預算單", "AI 初審", "專家複審", "系統設定"].map((p, i) => {
                  const active = (i === 0 && r.id !== "viewer") ||
                                 (i === 1 && (r.id === "admin" || r.id === "expert")) ||
                                 (i === 2 && (r.id === "admin" || r.id === "expert")) ||
                                 (i === 3 && r.id === "admin");
                  return (
                    <span key={p} style={{ color: active ? "var(--ok)" : "var(--text-subtle)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 50, background: active ? "var(--ok)" : "var(--border)" }}/>
                      {p}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="card">
          <div className="card-body tight">
            <div className="user-row head">
              <div>姓名</div>
              <div>角色</div>
              <div>部門</div>
              <div>最後登入</div>
              <div style={{ textAlign: "right" }}>狀態</div>
            </div>
            {users.map((u) => (
              <div className="user-row" key={u.id}>
                <div className="nm">
                  <div className="av">{u.name[0]}</div>
                  <div>{u.name}<small>{u.id}</small></div>
                </div>
                <div>
                  <span className="tag-sm">{MOCK.ROLES.find((r) => r.id === u.role)?.name}</span>
                </div>
                <div style={{ color: "var(--text-muted)" }}>{u.dept}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{u.last}</div>
                <div style={{ textAlign: "right" }}>
                  <span className={`badge ${u.active ? "ok" : "muted"}`}>
                    <span className="b-dot"/>{u.active ? "啟用" : "停用"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="card">
          <div className="card-head"><h3>存取紀錄 <span className="tag">LAST 50</span></h3></div>
          <div className="card-body tight">
            {[
              { who: "廖建勳", act: "簽核核可", obj: "BG-2026-W21-0008", t: "今日 09:42:11" },
              { who: "陳建宏", act: "建立預算單", obj: "BG-2026-W21-0015", t: "今日 09:33:02" },
              { who: "張雅婷", act: "編輯權限", obj: "ROLE:expert", t: "今日 08:58:44" },
              { who: "AI Agent (BSV)", act: "AI 初審", obj: "BG-2026-W21-0014", t: "今日 08:52:01" },
              { who: "黃志明", act: "退回案件", obj: "BG-2026-W20-0033", t: "昨日 17:48:21" },
              { who: "林淑芬", act: "登入系統", obj: "AD/lin.shufen", t: "昨日 17:32:09" },
            ].map((row, i) => (
              <div key={i} className="user-row" style={{ gridTemplateColumns: "180px 140px 1fr 160px" }}>
                <div className="nm">
                  <div className="av">{row.who[0]}</div>
                  <div>{row.who}<small>USER</small></div>
                </div>
                <div><span className="tag-sm">{row.act}</span></div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--accent-strong)" }}>{row.obj}</div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "right" }}>{row.t}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

Object.assign(window, { LibraryPage, AssignmentPage, PermissionsPage });
