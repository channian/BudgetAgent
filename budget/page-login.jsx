/* Login page */

function LoginPage({ onLogin }) {
  const [user, setUser] = React.useState("");
  const [pwd, setPwd] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!user || !pwd) return;
    setBusy(true);
    setTimeout(() => { setBusy(false); onLogin(user); }, 600);
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="mark">p</div>
          <div>
            <div className="name">pensieve</div>
            <div className="tag">AI 預算審核平台 · 2026</div>
          </div>
        </div>

        <h1>歡迎回來</h1>
        <div className="sub">透過 Active Directory 帳號登入</div>

        <div className="field">
          <label>
            使用者帳號
            <span className="label-hint">AD</span>
          </label>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="example: liao.jianxun"
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>密碼</label>
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="••••••••••"
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "驗證中…" : "登入"}
        </button>

        <div className="login-foot">
          <span><span className="status-dot"/>AD 服務正常</span>
          <span>v2.4.1 · build 20260518</span>
        </div>
      </form>
    </div>
  );
}

window.LoginPage = LoginPage;
