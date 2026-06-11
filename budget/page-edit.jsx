/* Budget submission / edit page */

function fmtFileSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function EditPage({ budget, onBack, onSave, currentUser }) {
  const isNew = !budget;

  const [form, setForm] = React.useState(() => ({
    project:       budget?.project       || "",
    budgetNo:      budget?.budgetNo      || "",
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

  // Attachments
  const [pendingFiles,  setPendingFiles]  = React.useState([]); // queued for upload after save (new budget)
  const [attachments,   setAttachments]   = React.useState([]); // existing attachments (edit mode)
  const [attUploading,  setAttUploading]  = React.useState(false);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!isNew && budget?.dbId) {
      API.fetchAttachments(budget.dbId)
        .then(list => setAttachments(list))
        .catch(() => {});
    }
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (isNew) {
      setPendingFiles(prev => [...prev, file]);
    } else {
      setAttUploading(true);
      API.uploadAttachment(budget.dbId, file)
        .then(att => setAttachments(prev => [...prev, att]))
        .catch(err => alert("上傳失敗：" + err.message))
        .finally(() => setAttUploading(false));
    }
  };

  const removePending = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const handleDeleteAtt = async (att) => {
    if (!confirm(`確定刪除附件「${att.original_name}」？`)) return;
    try {
      await API.deleteAttachment(att.id);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
    } catch (err) { alert("刪除失敗：" + err.message); }
  };

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
  const cyc = budget?.signDate ? MOCK.cycleTime(dispatchDate, budget.signDate) : null;

  const canSave = form.project && form.owner && form.amount;

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
          <button className="btn primary" disabled={!canSave} onClick={() => onSave({ ...form }, pendingFiles)}>
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
                  <label>預算單號 <span className="opt">(選填)</span></label>
                  <input
                    type="text"
                    value={form.budgetNo}
                    onChange={(e) => set("budgetNo", e.target.value)}
                    placeholder="例：2026-FA-00123"
                    className="mono"
                  />
                </div>
                <div className="field">
                  <label>系統 <span className="opt">(選填)</span></label>
                  <input
                    type="text"
                    value={form.subCategory}
                    onChange={(e) => set("subCategory", e.target.value)}
                    placeholder="例：空調 / 電力 / 水務…"
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
                  <label>負責專家 <span className="opt">(選填)</span></label>
                  <input
                    type="text"
                    value={form.expertName}
                    onChange={(e) => set("expertName", e.target.value)}
                    placeholder="輸入負責專家姓名"
                  />
                </div>
              </div>
              <div className="field-row two" style={{ marginTop: 14 }}>
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
          {/* Attachments */}
          <div className="card">
            <div className="card-head">
              <h3>附件 <span className="tag">ATTACHMENTS</span></h3>
              <button
                className="btn sm"
                disabled={attUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {attUploading ? "上傳中…" : "+ 上傳附件"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>
            <div className="card-body">
              {isNew ? (
                pendingFiles.length === 0 ? (
                  <div className="hint">尚無附件，點擊「上傳附件」新增（儲存後自動上傳）</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex-row" style={{ background: "var(--surface-2)", padding: "8px 12px", borderRadius: "var(--radius-sm)", gap: 8 }}>
                        <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtFileSize(f.size)}</span>
                        <button className="btn ghost sm" style={{ padding: "2px 8px", fontSize: 11, color: "var(--bad)" }} onClick={() => removePending(i)}>✕</button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                attachments.length === 0 ? (
                  <div className="hint">無附件</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {attachments.map(att => (
                      <div key={att.id} className="flex-row" style={{ background: "var(--surface-2)", padding: "8px 12px", borderRadius: "var(--radius-sm)", gap: 8 }}>
                        <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.original_name}>{att.original_name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtFileSize(att.file_size)}</span>
                        <button className="btn ghost sm" style={{ padding: "2px 10px", fontSize: 11 }} onClick={() => API.downloadAttachment(att.id, att.original_name)}>下載</button>
                        <button className="btn ghost sm" style={{ padding: "2px 8px", fontSize: 11, color: "var(--bad)" }} onClick={() => handleDeleteAtt(att)}>✕</button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Side: auto-filled meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head"><h3>自動產生 <span className="tag">AUTO</span></h3></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
