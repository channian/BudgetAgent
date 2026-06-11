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
          <div className="mark">預</div>
          <div>
            <div className="name">預算AI審核平台</div>
            <div className="tag">AI Budget Review Platform · 2026</div>
          </div>
        </div>

        <h1>歡迎回來</h1>
        <div className="sub">使用員工編號及 Windows 密碼登入</div>

        <div className="field">
          <label>
            員工編號
            <span className="label-hint">empno</span>
          </label>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="例：K20076"
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>Windows 密碼</label>
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
          <span>帳號由系統管理員開通</span>
          <span>v2.4.1 · build 20260604</span>
        </div>
      </form>
    </div>
  );
}

window.LoginPage = LoginPage;
