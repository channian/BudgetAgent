/* Budget detail / approval page */

function DetailPage({ budget, onBack, onApprove, onReject, onEdit }) {
  const [comment, setComment] = React.useState(budget.expertComment || "");
  const [decision, setDecision] = React.useState(budget.expertResult);
  const isFinal = budget.status === "approved" || budget.status === "rejected";

  const cyc = MOCK.cycleTime(budget.dispatchDate, budget.signDate || new Date("2026-05-21T10:00:00"));

  const submit = () => {
    if (!decision) return;
    if (decision === "approve") onApprove(budget, comment);
    else onReject(budget, comment);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="flex-row" style={{ marginBottom: 8 }}>
            <button className="btn ghost sm" onClick={onBack}><Icon.Back/>返回列表</button>
            <span className="tag-sm">{budget.categoryId} · {budget.subCategory}</span>
            <StatusBadge status={budget.status}/>
          </div>
          <h2 style={{ marginBottom: 2 }}>{budget.project}</h2>
          <div className="lede">
            <span className="id-cell mono">{budget.id}</span>
            <span style={{ margin: "0 8px", color: "var(--text-subtle)" }}>·</span>
            派送 {MOCK.fmtDate(budget.dispatchDate)}
          </div>
        </div>
        <div className="actions">
          {!isFinal && <button className="btn" onClick={() => onEdit(budget)}>編輯</button>}
          <button className="btn">列印審核單</button>
          <button className="btn ghost"><Icon.More/></button>
        </div>
      </div>

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Core metadata */}
          <div className="card">
            <div className="card-head">
              <h3>案件資料 <span className="tag">CASE INFO</span></h3>
              <span className="hint">最後更新 {MOCK.fmtDate(budget.signDate || budget.dispatchDate)}</span>
            </div>
            <div className="card-body tight">
              <div className="kv-grid">
                <div className="kv"><div className="k">週數</div><div className="v mono">W{String(budget.week).padStart(2, "0")} / 2026</div></div>
                <div className="kv"><div className="k">類別</div><div className="v">{budget.category}</div></div>
                <div className="kv"><div className="k">判定類別</div><div className="v">{budget.subCategory}</div></div>
                <div className="kv"><div className="k">預算單號</div><div className="v mono" style={{ color: "var(--accent-strong)" }}>{budget.id}</div></div>
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
              <h3><Icon.Sparkles/>AI 初審 <span className="tag">MODEL: BUDGET-SCREENER v3.2.1</span></h3>
              <div className="flex-row">
                <ResultBadge result={budget.aiResult} kind="ai"/>
                <Conf value={budget.aiConfidence}/>
              </div>
            </div>
            <div className="card-body">
              <div className="ai-block">
                <h4>原因 / Reason</h4>
                <div className="reason">{budget.aiReason}</div>
                <div className="ai-meta">
                  <span><strong>政策參照</strong> P-005 §3.2</span>
                  <span><strong>對齊度</strong> OBJ-2026-A3 · 0.74</span>
                  <span><strong>風險旗標</strong> {budget.aiResult === "reject" ? "VND-02, AMT-HIGH" : "—"}</span>
                  <span><strong>耗時</strong> 1.42s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expert review */}
          <div className="card">
            <div className="card-head">
              <h3>專家複審 <span className="tag">EXPERT REVIEW</span></h3>
              {isFinal && <ResultBadge result={budget.expertResult}/>}
            </div>
            <div className="card-body">
              <div className="field" style={{ marginBottom: 14 }}>
                <label>專家複審評論 {!isFinal && <span className="opt">(將寫入稽核紀錄)</span>}</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  readOnly={isFinal}
                  placeholder="請說明審核判斷依據、補件要求或後續行動…"
                  rows={4}
                />
                {!isFinal && <div className="helper">建議引用具體政策章節或案例編號，以利後續稽核追溯</div>}
              </div>

              {!isFinal ? (
                <div className="field">
                  <label>專家審核處置 <span className="req">*</span></label>
                  <div className="seg">
                    <button
                      type="button"
                      className={decision === "approve" ? "on approve" : ""}
                      onClick={() => setDecision("approve")}
                    >
                      <Icon.Check s={14}/>核可
                    </button>
                    <button
                      type="button"
                      className={decision === "reject" ? "on reject" : ""}
                      onClick={() => setDecision("reject")}
                    >
                      ✕ 退回
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label>專家審核處置</label>
                  <div><ResultBadge result={budget.expertResult}/></div>
                </div>
              )}

              {!isFinal && (
                <div className="flex-row" style={{ marginTop: 18, gap: 8 }}>
                  <button className="btn primary" disabled={!decision} onClick={submit}>
                    確認簽核
                  </button>
                  <button className="btn">退回申請人補件</button>
                  <span className="spacer-x"/>
                  <span className="hint">簽核後不可變更，將同步至 ERP</span>
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
                目標 ≤ 3d · {cyc && cyc.hrs / 24 > 3 ? "已超 SLA" : "符合 SLA"}
              </div>
              <div className="divider-h"/>
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

          <div className="card">
            <div className="card-head"><h3>審核時序 <span className="tag">TIMELINE</span></h3></div>
            <div className="card-body">
              <div className="timeline">
                <div className="tl-item done">
                  <div className="who">{budget.owner.name} 建立預算單</div>
                  <div className="what">{budget.id}</div>
                  <div className="when">{MOCK.fmtDate(new Date(budget.dispatchDate.getTime() - 3600000))}</div>
                </div>
                <div className="tl-item done">
                  <div className="who">AI Agent 完成初審</div>
                  <div className="what">信心度 {budget.aiConfidence}% · <ResultBadge result={budget.aiResult} kind="ai"/></div>
                  <div className="when">{MOCK.fmtDate(budget.dispatchDate)}</div>
                </div>
                <div className={`tl-item ${isFinal ? "done" : "active"}`}>
                  <div className="who">{isFinal ? "廖建勳 完成複審" : "廖建勳 (進行中)"}</div>
                  <div className="what">{isFinal ? <ResultBadge result={budget.expertResult}/> : "等待專家決議"}</div>
                  <div className="when">{budget.signDate ? MOCK.fmtDate(budget.signDate) : "—"}</div>
                </div>
                {isFinal && (
                  <div className="tl-item">
                    <div className="who">同步至 ERP</div>
                    <div className="what">SAP-FI · 待批次傳輸</div>
                    <div className="when">每日 18:00</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>相似歷史案件 <span className="tag">SIMILAR</span></h3></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { id: "BG-2026-W14-0021", amt: budget.amount * 0.92, label: "已核可", cls: "ok" },
                { id: "BG-2026-W11-0008", amt: budget.amount * 1.08, label: "已核可", cls: "ok" },
                { id: "BG-2026-W09-0033", amt: budget.amount * 1.34, label: "已退回", cls: "bad" },
              ].map((s) => (
                <div key={s.id} className="flex-row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                  <span className="mono" style={{ color: "var(--accent-strong)" }}>{s.id}</span>
                  <span className="mono" style={{ color: "var(--text-muted)" }}>NT$ {fmtAmount(Math.round(s.amt))}</span>
                  <span className={`badge ${s.cls}`}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.DetailPage = DetailPage;
