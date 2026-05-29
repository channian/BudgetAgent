/* Budget submission / edit page */

function EditPage({ budget, onBack, onSave, currentUser }) {
  const isNew = !budget;

  const [form, setForm] = React.useState(() => ({
    project:       budget?.project       || "",
    category:      budget?.category      || "",
    subCategory:   budget?.subCategory   || "",
    expertName:    budget?.expertName    || "",
    owner:         budget?.owner?.name   || currentUser?.name || "",
    amount:        budget?.amount        || "",
    notes:         budget?.notes         || "",
    expertComment: budget?.expertComment || "",
    expertResult:  budget?.expertResult  || null,
    aiResult:      budget?.aiResult      || null,
    aiConfidence:  budget?.aiConfidence  || null,
    aiReason:      budget?.aiReason      || "",
  }));
  const [jsonText, setJsonText] = React.useState("");
  const [jsonErr, setJsonErr]   = React.useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const applyAiJson = () => {
    setJsonErr("");
    try {
      const trimmed = jsonText.trim();
      const j = trimmed ? JSON.parse(trimmed) : MOCK.SAMPLE_AI_JSON;
      if (!trimmed) setJsonText(JSON.stringify(MOCK.SAMPLE_AI_JSON, null, 2));

      const mapped = API.mapAiJsonPaste(j);
      if (!mapped || !mapped.aiResult) { setJsonErr("無法識別 JSON 格式，請確認欄位"); return; }

      // If RPA JSON (Chinese keys), also fill project metadata fields (free text)
      setForm(f => ({
        ...f,
        aiResult:     mapped.aiResult,
        aiConfidence: mapped.aiConfidence,
        aiReason:     mapped.aiReason,
        ...(mapped.project      && { project:     mapped.project }),
        ...(mapped.categoryName && { category:    mapped.categoryName }),
        ...(mapped.subCategory  && { subCategory: mapped.subCategory }),
        ...(mapped.expertName   && { expertName:  mapped.expertName }),
      }));
    } catch (e) {
      setJsonErr("JSON 格式錯誤：" + e.message);
    }
  };

  const dispatchDate = budget?.dispatchDate || new Date();
  const week = MOCK.weekOf(dispatchDate);
  const budgetNo = budget?.id || MOCK.nextDispatchNo([]);
  const cyc = budget?.signDate ? MOCK.cycleTime(dispatchDate, budget.signDate) : null;

  const canSave = form.project && form.category && form.owner && form.amount;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="flex-row" style={{ marginBottom: 8 }}>
            <button className="btn ghost sm" onClick={onBack}><Icon.Back/>返回</button>
            <span className="tag-sm">{isNew ? "NEW" : "EDIT"}</span>
            {budget && <StatusBadge status={budget.status}/>}
          </div>
          <h2 style={{ marginBottom: 2 }}>{isNew ? "建立新預算單" : "編輯預算單"}</h2>
          <div className="lede">完成後將進入 AI 初審佇列，預計 30 秒內回傳結果</div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={onBack}>取消</button>
          <button className="btn primary" disabled={!canSave} onClick={() => onSave({ ...form })}>
            {isNew ? "送出申請" : "儲存變更"}
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Project info */}
          <div className="card">
            <div className="card-head">
              <h3>項目資料 <span className="tag">PROJECT</span></h3>
            </div>
            <div className="card-body">
              <div className="field-row">
                <div className="field">
                  <label>項目名稱 <span className="req">*</span></label>
                  <input
                    type="text"
                    value={form.project}
                    onChange={(e) => set("project", e.target.value)}
                    placeholder="例：Q2 智能客服平台升級"
                  />
                </div>
              </div>
              <div className="field-row two" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>類別 <span className="req">*</span></label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    placeholder="例：研發費用 / 資訊系統"
                  />
                </div>
                <div className="field">
                  <label>判定類別 <span className="opt">(選填)</span></label>
                  <input
                    type="text"
                    value={form.subCategory}
                    onChange={(e) => set("subCategory", e.target.value)}
                    placeholder="例：軟體授權"
                  />
                </div>
              </div>
              <div className="field-row two" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>預算負責人 <span className="req">*</span></label>
                  <input
                    type="text"
                    value={form.owner}
                    onChange={(e) => set("owner", e.target.value)}
                    placeholder="輸入負責人姓名"
                  />
                </div>
                <div className="field">
                  <label>金額 (NT$) <span className="req">*</span></label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                    placeholder="0"
                  />
                  <div className="helper">{form.amount ? `≈ ${fmtAmount(Number(form.amount))} 元` : "請輸入新台幣整數金額"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* AI JSON paste */}
          <div className="card">
            <div className="card-head">
              <h3><Icon.Sparkles/>AI 初審結果 <span className="tag">PASTE JSON</span></h3>
              <div className="flex-row">
                <button type="button" className="btn sm" onClick={() => { setJsonText(JSON.stringify(MOCK.SAMPLE_AI_JSON, null, 2)); setJsonErr(""); }}>
                  載入範例
                </button>
                <button type="button" className="btn sm accent" onClick={applyAiJson}>
                  套用至表單
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="field">
                <label>貼上 AI Agent 回傳 JSON <span className="opt">(decision / confidence / reason)</span></label>
                <JsonEditor value={jsonText} onChange={setJsonText}/>
                {jsonErr && <div className="helper" style={{ color: "var(--bad)" }}>{jsonErr}</div>}
                {!jsonErr && jsonText && <div className="helper">已解析，按「套用至表單」帶入下方欄位</div>}
              </div>

              <div className="field-row two" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>AI 審核處置 (read-only)</label>
                  <div style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface-2)", minHeight: 36, display: "flex", alignItems: "center", gap: 8 }}>
                    {form.aiResult ? (
                      <>
                        <ResultBadge result={form.aiResult} kind="ai"/>
                        {form.aiConfidence != null && <Conf value={form.aiConfidence}/>}
                      </>
                    ) : (
                      <span className="hint">等待 AI 回傳</span>
                    )}
                  </div>
                </div>
                <div className="field">
                  <label>派送日期 (auto)</label>
                  <input type="text" readOnly value={MOCK.fmtDate(dispatchDate)} className="mono"/>
                </div>
              </div>

              <div className="field" style={{ marginTop: 14 }}>
                <label>AI 初審評論 (read-only)</label>
                <textarea readOnly value={form.aiReason} placeholder="套用 JSON 後將自動填入" rows={3}/>
              </div>
            </div>
          </div>

          {/* Expert decision */}
          <div className="card">
            <div className="card-head"><h3>專家複審 <span className="tag">REVIEW</span></h3></div>
            <div className="card-body">
              <div className="field">
                <label>專家複審評論</label>
                <textarea
                  value={form.expertComment}
                  onChange={(e) => set("expertComment", e.target.value)}
                  placeholder="說明審核判斷依據、補件要求或後續行動…"
                  rows={4}
                />
              </div>
              <div className="field-row two" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>專家審核處置</label>
                  <div className="seg">
                    <button
                      type="button"
                      className={form.expertResult === "approve" ? "on approve" : ""}
                      onClick={() => set("expertResult", "approve")}
                    >
                      <Icon.Check s={14}/>核可
                    </button>
                    <button
                      type="button"
                      className={form.expertResult === "reject" ? "on reject" : ""}
                      onClick={() => set("expertResult", "reject")}
                    >
                      ✕ 退回
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>備註 <span className="opt">(選填)</span></label>
                  <input type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="附註訊息…"/>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side: auto-filled meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head"><h3>自動產生 <span className="tag">AUTO</span></h3></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <KvLine k="預算單號" v={budgetNo} mono accent/>
              <KvLine k="週數" v={`W${String(week).padStart(2, "0")} / 2026`} mono/>
              <KvLine k="派送日期" v={MOCK.fmtDate(dispatchDate)} mono/>
              <KvLine k="簽核日期" v={budget?.signDate ? MOCK.fmtDate(budget.signDate) : "送出後系統填入"} mono/>
              <KvLine k="Cycle Time" v={cyc ? cyc.label : "—"} mono/>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>檢核提示 <span className="tag">CHECKS</span></h3></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              <CheckRow ok={!!form.project} label="已填寫項目名稱"/>
              <CheckRow ok={!!form.category} label="已填寫類別"/>
              <CheckRow ok={!!form.amount && Number(form.amount) > 0} label="金額有效"/>
              <CheckRow ok={!!form.owner} label="已填寫預算負責人"/>
              <CheckRow ok={!!form.aiResult} label="AI 初審結果已套用 (選填)" warn/>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>提示 <span className="tag">TIP</span></h3></div>
            <div className="card-body" style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              貼上 AI Agent 回傳的 JSON 後，系統會自動帶入 <span className="mono" style={{ color: "var(--accent-strong)" }}>decision</span>、<span className="mono" style={{ color: "var(--accent-strong)" }}>confidence</span>、<span className="mono" style={{ color: "var(--accent-strong)" }}>reason</span> 欄位。所有 AI 欄位皆為唯讀，僅供決策參考。
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function KvLine({ k, v, mono, accent }) {
  return (
    <div className="flex-row" style={{ justifyContent: "space-between" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{k}</span>
      <span className={mono ? "mono" : ""} style={{ fontSize: 13, fontWeight: 500, color: accent ? "var(--accent-strong)" : "var(--text)" }}>{v}</span>
    </div>
  );
}

function CheckRow({ ok, warn, label }) {
  const color = ok ? "var(--ok)" : warn ? "var(--warn)" : "var(--text-subtle)";
  return (
    <div className="flex-row">
      <span style={{ width: 14, height: 14, borderRadius: 3, background: ok ? "var(--ok-soft)" : warn ? "var(--warn-soft)" : "var(--surface-2)", color, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, border: `1px solid ${color}33` }}>
        {ok ? "✓" : warn ? "!" : "·"}
      </span>
      <span style={{ color: ok ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

/* Lightweight JSON code editor with syntax highlight */
function JsonEditor({ value, onChange }) {
  return (
    <div style={{ position: "relative" }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="json-paste"
        style={{ width: "100%", minHeight: 160, color: "oklch(0.92 0.01 240)", caretColor: "white", border: "1px solid oklch(0.3 0.02 250)" }}
        placeholder='{ "decision": "approve", "confidence": 0.91, "reason": "..." }'
      />
    </div>
  );
}

window.EditPage = EditPage;
