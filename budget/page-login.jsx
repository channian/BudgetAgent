/* Login page */

function LoginPage({ onLogin }) {
  const [user, setUser] = React.useState("");
  const [pwd, setPwd] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!user || !pwd) return;
    setBusy(true);
    setError("");
    try {
      const u = await API.login(user, pwd);
      onLogin(u);
    } catch (err) {
      setError(err.message || "登入失敗，請確認帳號密碼");
    } finally {
      setBusy(false);
    }
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

        {error && <div style={{ color: "var(--bad)", fontSize: 12, marginTop: -4 }}>{error}</div>}

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
