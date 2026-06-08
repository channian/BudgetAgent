/* Budget detail / approval page */

const ACTION_LABELS = {
  CREATE:                "建立預算單",
  UPDATE:                "欄位更新",
  APPROVE:               "核可簽核",
  REJECT_FINAL:          "最終退件",
  RETURN_FOR_SUPPLEMENT: "退回補件",
  RESUBMIT:              "重新遞交",
  SLA_REMINDER:          "SLA 催辦",
};

function DetailPage({ budget, onBack, onApprove, onReject, onReturn, onSaveReview, onDelete, onEdit, currentUser, fromRoute }) {
  const [comment,  setComment]  = React.useState(budget.expertComment || "");
  const [decision, setDecision] = React.useState(budget.expertResult);
  const [timeline, setTimeline] = React.useState([]);
  const [tlLoading, setTlLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const role     = currentUser?.role || "viewer";
  const isViewer = role === "viewer";
  const isAdmin  = role === "admin";
  const isFinal  = budget.status === "CLOSED" || budget.status === "REJECTED";
  const isOpen   = budget.status === "EXPERT_REVIEW" || budget.status === "PENDING_ACTION";
  const needsLock = isOpen && role === "expert";

  // lockState: null (not started) | "busy" (acquiring) | {ok:true} | {ok:false, locked_by, expires_in}
  const [lockState, setLockState] = React.useState(null);

  React.useEffect(() => {
    if (!needsLock || !budget.dbId) return;
    setLockState("busy");
    API.acquireLock(budget.dbId)
      .then(res => setLockState(res))
      .catch(() => setLockState({ ok: false, locked_by: "（網路錯誤）", expires_in: 900 }));
    return () => { API.releaseLock(budget.dbId).catch(() => {}); };
  }, [budget.dbId, needsLock]);

  const lockBusy      = needsLock && lockState === "busy";
  const lockedByOther = needsLock && lockState && lockState !== "busy" && !lockState.ok;
  // Expert can only fill in review when arriving from the 待專家審核 tab
  const canReview = isOpen && role === "expert" && fromRoute === "expert_review" && !lockBusy && !lockedByOther;
  const canSign   = isOpen && (role === "admin" || role === "boss");

  const cyc = MOCK.cycleTime(budget.dispatchDate, budget.signDate || new Date());

  // Load real timeline
  React.useEffect(() => {
    if (!budget.dbId) { setTlLoading(false); return; }
    API.fetchTimeline(budget.dbId)
      .then(rows => setTimeline(rows))
      .catch(() => setTimeline([]))
      .finally(() => setTlLoading(false));
  }, [budget.dbId]);

  const submitReview = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const dec = decision === "approve" ? "通過" : decision === "reject" ? "退件" : null;
      await onSaveReview(budget, comment, dec);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (busy) return;
    const reason = window.prompt(
      `確定要刪除案件「${budget.project}」(#${budget.id})？\n` +
      `此操作無法復原，案件及其稽核紀錄將一併移除。\n\n` +
      `請輸入刪除原因（必填，將記錄於通知）：`
    );
    if (reason === null) return;                 // cancelled
    if (!reason.trim()) { alert("請輸入刪除原因。"); return; }
    setBusy(true);
    try {
      await onDelete(budget, reason.trim());
    } finally {
      setBusy(false);
    }
  };

  const submitFinal = async () => {
    if (!decision || busy) return;
    setBusy(true);
    try {
      if (decision === "approve") await onApprove(budget, comment);
      else await onReject(budget, comment, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="flex-row" style={{ marginBottom: 8 }}>
            <button className="btn ghost sm" onClick={onBack}><Icon.Back />返回列表</button>
            <span className="tag-sm">{budget.categoryId} · {budget.subCategory}</span>
            <StatusBadge status={budget.status} />
          </div>
          <h2 style={{ marginBottom: 2 }}>{budget.project}</h2>
          <div className="lede">
            <span className="id-cell mono">{budget.id}</span>
            <span style={{ margin: "0 8px", color: "var(--text-subtle)" }}>·</span>
            派送 {MOCK.fmtDate(budget.dispatchDate)}
          </div>
        </div>
        <div className="actions">
          {!isFinal && !isViewer && <button className="btn" onClick={() => onEdit(budget)}>編輯</button>}
          {isAdmin && (
            <div className="more-wrap">
              <button
                className="btn ghost"
                onClick={() => setMenuOpen(o => !o)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
              ><Icon.More /></button>
              {menuOpen && (
                <>
                  <div className="more-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="more-menu" role="menu">
                    <button className="more-item danger" role="menuitem" onClick={handleDelete} disabled={busy}>
                      🗑 刪除案件
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Core metadata */}
          <div className="card">
            <div className="card-head">
              <h3>案件資料 <span className="tag">CASE INFO</span></h3>
              <span className="hint">最後更新 {MOCK.fmtDate(budget.updatedAt || budget.dispatchDate)}</span>
            </div>
            <div className="card-body tight">
              <div className="kv-grid">
                <div className="kv"><div className="k">週數</div><div className="v mono">W{String(budget.week).padStart(2, "0")} / 2026</div></div>
                <div className="kv"><div className="k">類別</div><div className="v">{budget.category}</div></div>
                <div className="kv"><div className="k">判定系統</div><div className="v">{budget.subCategory || "—"}</div></div>
                <div className="kv"><div className="k">預算單號</div><div className="v mono" style={{ color: "var(--accent-strong)" }}>{budget.id}</div></div>
                <div className="kv"><div className="k">負責專家</div><div className="v">{budget.expertName || "—"}</div></div>
                <div className="kv"><div className="k">項目名稱</div><div className="v">{budget.project}</div></div>
                <div className="kv"><div className="k">預算負責人</div><div className="v">{budget.owner.name} <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 4 }}>· {budget.owner.dept}</span></div></div>
                <div className="kv"><div className="k">金額</div><div className="v lg">NT$ {fmtAmount(budget.amount)}</div></div>
                <div className="kv"><div className="k">派送日期</div><div className="v mono">{MOCK.fmtDate(budget.dispatchDate)}</div></div>
                <div className="kv"><div className="k">簽核日期</div><div className="v mono">{budget.signDate ? MOCK.fmtDate(budget.signDate) : "待簽核"}</div></div>
              </div>
            </div>
          </div>

          {/* AI block */}
          <div className="card">
            <div className="card-head">
              <h3><Icon.Sparkles />AI 初審 <span className="tag">READ-ONLY</span></h3>
              <div className="flex-row">
                <ResultBadge result={budget.aiResult} kind="ai" />
                <Conf value={budget.aiConfidence} />
              </div>
            </div>
            <div className="card-body">
              <div className="ai-block">
                <h4>原因 / Reason</h4>
                <div className="reason">{budget.aiReason || "—"}</div>
              </div>
            </div>
          </div>

          {/* Expert review */}
          <div className="card">
            <div className="card-head">
              <h3>專家複審 <span className="tag">EXPERT REVIEW</span></h3>
              {isFinal && <ResultBadge result={budget.expertResult} />}
            </div>
            <div className="card-body">
              {lockBusy && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--border-soft)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)" }}>
                  ⏳ 取得編輯權限中…
                </div>
              )}
              {lockedByOther && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--warn-soft)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "oklch(0.5 0.16 75)" }}>
                  🔒 正在被「{lockState.locked_by}」編輯中，約 {Math.ceil((lockState.expires_in || 0) / 60)} 分鐘後釋放
                </div>
              )}
              <div className="field" style={{ marginBottom: 14 }}>
                <label>專家複審評論 {canReview && <span className="opt">(將寫入稽核紀錄)</span>}</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  readOnly={!canReview}
                  placeholder="請說明審核判斷依據、補件要求或後續行動…"
                  rows={4}
                />
                {canReview && <div className="helper">建議引用具體政策章節或案例編號，以利後續稽核追溯</div>}
              </div>

              {(canReview || canSign) ? (
                <>
                  <div className="field">
                    <label>{canSign ? "最終審核處置" : "建議審核處置"} <span className="req">*</span></label>
                    <div className="seg">
                      <button
                        type="button"
                        className={decision === "approve" ? "on approve" : ""}
                        onClick={() => setDecision("approve")}
                      >
                        <Icon.Check s={14} />核可
                      </button>
                      <button
                        type="button"
                        className={decision === "reject" ? "on reject" : ""}
                        onClick={() => setDecision("reject")}
                      >
                        ✕ 退件
                      </button>
                    </div>
                  </div>

                  <div className="flex-row" style={{ marginTop: 18, gap: 8 }}>
                    {canReview && (
                      <button className="btn" disabled={busy} onClick={submitReview}>
                        {busy ? "儲存中…" : "儲存評論"}
                      </button>
                    )}
                    {canSign && (
                      <button className="btn primary" disabled={!decision || busy} onClick={submitFinal}>
                        {busy ? "送出中…" : "確認簽核"}
                      </button>
                    )}
                    <span className="spacer-x" />
                    <span className="hint">
                      {canSign ? "簽核後不可變更，將同步至 ERP" : "儲存後案件自動進入待簽核，由 boss / 管理員最終簽核"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="field">
                  <label>專家審核處置</label>
                  <div style={{ marginTop: 4 }}>
                    {budget.expertResult
                      ? <ResultBadge result={budget.expertResult} />
                      : <span className="hint">—</span>
                    }
                  </div>
                </div>
              )}

              {budget.status === "PENDING_ACTION" && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--warn-soft)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "oklch(0.5 0.16 75)" }}>
                  ⚠ 此案件已退回申請人補件，請補件後重新遞交
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {budget.notes && (
            <div className="card">
              <div className="card-head"><h3>備註 <span className="tag">NOTES</span></h3></div>
              <div className="card-body">
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)" }}>{budget.notes}</div>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head"><h3>Cycle Time <span className="tag">SLA</span></h3></div>
            <div className="card-body">
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {cyc ? cyc.label : "—"}
              </div>
              <div className="hint" style={{ marginTop: 4 }}>
                目標 ≤ 3d · {cyc && cyc.hrs / 24 > 3 ? "⚠ 已超 SLA" : "✓ 符合 SLA"}
              </div>
              <div className="divider-h" />
              <div className="flex-row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>派送</span>
                <span className="mono">{MOCK.fmtDate(budget.dispatchDate)}</span>
              </div>
              <div className="flex-row" style={{ justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>簽核</span>
                <span className="mono">{budget.signDate ? MOCK.fmtDate(budget.signDate) : "—"}</span>
              </div>
            </div>
          </div>

          {/* Timeline from audit_logs */}
          <div className="card">
            <div className="card-head"><h3>審核時序 <span className="tag">TIMELINE</span></h3></div>
            <div className="card-body">
              {tlLoading ? (
                <div className="hint">載入中…</div>
              ) : timeline.length === 0 ? (
                <div className="hint">尚無稽核紀錄</div>
              ) : (
                <div className="timeline">
                  {timeline.map((item, i) => (
                    <div key={item.log_id || i} className={`tl-item ${i === timeline.length - 1 && !isFinal ? "active" : "done"}`}>
                      <div className="who">{item.operator} · {ACTION_LABELS[item.action] || item.action}</div>
                      <div className="what">{item.action === "APPROVE" ? <ResultBadge result="approve" /> : item.action === "REJECT_FINAL" ? <ResultBadge result="reject" /> : null}</div>
                      <div className="when">{item.timestamp ? MOCK.fmtDate(new Date(item.timestamp)) : "—"}</div>
                    </div>
                  ))}
                  {!isFinal && (
                    <div className="tl-item">
                      <div className="who">等待專家決議</div>
                      <div className="what"><StatusBadge status={budget.status} /></div>
                      <div className="when">—</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.DetailPage = DetailPage;
