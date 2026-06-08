/* Budget list page — pending / expert_review / approved scopes */

const DEFAULT_COLS = [
  { k: "week",        label: "週數",         w: 78,  sortable: true,  min: 60 },
  { k: "category",    label: "類別",         w: 130, min: 100 },
  { k: "subCategory", label: "系統",         w: 130, min: 100 },
  { k: "id",          label: "預算單號",     w: 170, min: 130 },
  { k: "project",     label: "項目名稱",     w: 280, min: 160 },
  { k: "expertName",  label: "負責專家",     w: 130, min: 100 },
  { k: "owner",       label: "預算負責人",   w: 160, min: 130 },
  { k: "amount",      label: "金額 (NT$)",   w: 130, sortable: true, min: 110, align: "right" },
  { k: "aiResult",      label: "AI 審核處置", w: 240, min: 180 },
  { k: "expertResult",  label: "審核處置",   w: 120, min: 100 },
  { k: "expertComment", label: "專家評論",   w: 200, min: 140 },
  { k: "status",      label: "狀態",         w: 110, min: 90 },
  { k: "dispatchDate",label: "派送日期",     w: 130, sortable: true, min: 110 },
  { k: "signDate",    label: "簽核日期",     w: 130, min: 110 },
  { k: "cycle",       label: "Cycle Time",   w: 110, min: 90 },
];

// Columns shown in the 待專家審核 tab
const EXPERT_COLS = [
  { k: "week",        label: "週數",         w: 78,  sortable: true, min: 60 },
  { k: "category",    label: "類別",         w: 130, min: 100 },
  { k: "subCategory", label: "系統",         w: 130, min: 100 },
  { k: "project",     label: "項目名稱",     w: 300, min: 180 },
  { k: "expertName",  label: "負責專家",     w: 130, min: 100 },
  { k: "amount",      label: "金額 (NT$)",   w: 130, sortable: true, min: 110, align: "right" },
  { k: "aiResult",    label: "AI 初審結果",  w: 260, min: 200 },
  { k: "status",      label: "狀態",         w: 110, min: 90 },
  { k: "dispatchDate",label: "派送日期",     w: 130, sortable: true, min: 110 },
];

// Columns shown for AI_REVIEW block on main page
const AI_REVIEW_COLS = [
  { k: "week",        label: "週數",         w: 78,  sortable: true, min: 60 },
  { k: "category",    label: "類別",         w: 130, min: 100 },
  { k: "subCategory", label: "系統",         w: 130, min: 100 },
  { k: "project",     label: "項目名稱",     w: 300, min: 180 },
  { k: "amount",      label: "金額 (NT$)",   w: 130, sortable: true, min: 110, align: "right" },
  { k: "aiResult",    label: "AI 初審結果",  w: 260, min: 200 },
  { k: "budgetNoEdit",label: "預算單號",     w: 200, min: 160 },
];

const PENDING_STATUSES   = ["AI_REVIEW", "EXPERT_REVIEW", "PENDING_ACTION"];
const COMPLETED_STATUSES = ["CLOSED", "REJECTED"];

function CopyBtn({ text }) {
  const [done, setDone] = React.useState(false);
  const handleCopy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!text) return;
    copyToClipboard(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }).catch(() => {
      alert("複製失敗，請手動選取文字複製");
    });
  };
  return (
    <button type="button" className="copy-btn" title="複製" onClick={handleCopy}>
      {done ? "✓" : <Icon.Copy s={11} />}
    </button>
  );
}

// Inline budget_no editor (used in AI_REVIEW block on main page)
function BudgetNoCell({ dbId, value, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal]         = React.useState(value || "");
  const [saving, setSaving]   = React.useState(false);

  const save = async (e) => {
    e && e.stopPropagation();
    setSaving(true);
    try {
      await API.saveBudgetNo(dbId, val);
      onSaved(val);
      setEditing(false);
    } catch (err) {
      Toast.show("儲存失敗：" + err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  if (editing) return (
    <span style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        style={{ width: 120, fontSize: 12, padding: "2px 6px", border: "1px solid var(--accent)", borderRadius: 4 }}
        disabled={saving}
      />
      <button className="btn-approve-sm" onClick={save} disabled={saving}>✓</button>
      <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }} onClick={e => { e.stopPropagation(); setEditing(false); }}>✕</button>
    </span>
  );

  return (
    <span
      style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title="點擊填入預算單號"
    >
      <span className={val ? "mono" : ""} style={{ fontSize: 12, color: val ? "var(--accent-strong)" : "var(--text-muted)" }}>
        {val || "點擊填入…"}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-subtle)", opacity: 0.7 }}>✎</span>
    </span>
  );
}

// Shared data table
function BudgetTable({
  cols, rows, onRow, sort, toggleSort, arr, startColResize, setCols,
  showSelect, selected, onToggleRow, onToggleAll, allSelected, someSelected,
  showSign, onSign, onBudgetNoSaved,
}) {
  const chkW = 36, actW = 96;
  const extraW = (showSelect ? chkW : 0) + (showSign ? actW : 0);

  return (
    <div className="table-scroll">
      <table className="dt" style={{ width: "100%", minWidth: extraW + cols.reduce((s, c) => s + c.w, 0) }}>
        <colgroup>
          {showSelect && <col style={{ width: chkW }} />}
          {cols.map((c) => <col key={c.k} style={{ width: c.w }} />)}
          {showSign && <col style={{ width: actW }} />}
        </colgroup>
        <thead>
          <tr>
            {showSelect && (
              <th className="col-chk" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={!!allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={onToggleAll}
                  title="全選"
                />
              </th>
            )}
            {cols.map((c, idx) => (
              <th
                key={c.k}
                className={`${c.sortable ? "sortable" : ""} ${sort.k === c.k ? "sorted" : ""}`}
                style={{ textAlign: c.align || "left" }}
                onClick={c.sortable ? () => toggleSort(c.k) : undefined}
              >
                {c.label}
                {c.sortable && <span className="arr">{arr(c.k)}</span>}
                {idx < cols.length - 1 && (
                  <span
                    className="col-resize"
                    onMouseDown={(e) => startColResize(idx, e)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setCols((cs) => cs.map((col, i) => i === idx ? { ...col, w: DEFAULT_COLS[idx]?.w || col.w } : col));
                    }}
                    title="拖曳調整欄寬，雙擊重設"
                  />
                )}
              </th>
            ))}
            {showSign && <th className="col-act">操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.dbId} onClick={() => {
              const sel = window.getSelection && window.getSelection();
              if (sel && sel.type === "Range" && String(sel).trim().length > 0) return;
              onRow(b);
            }} className={showSelect && selected && selected.has(b.dbId) ? "row-selected" : ""}>
              {showSelect && (
                <td className="col-chk" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(b.dbId)} onChange={() => onToggleRow(b.dbId)} />
                </td>
              )}
              {cols.map((c) => (
                <td key={c.k} style={{ textAlign: c.align || "left" }} className={
                  c.k === "amount" ? "col-amt" :
                  (c.k === "dispatchDate" || c.k === "signDate") ? "col-date" : ""
                }>
                  {c.k === "budgetNoEdit"
                    ? <BudgetNoCell dbId={b.dbId} value={b.budgetNo} onSaved={(v) => onBudgetNoSaved && onBudgetNoSaved(b.dbId, v)} />
                    : renderCell(b, c.k)
                  }
                </td>
              ))}
              {showSign && (
                <td className="col-act" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-approve-sm" onClick={(e) => { e.stopPropagation(); onSign(b); }}>
                    {b.expertResult === "reject" ? "✕ 簽核退件" : "✓ 簽核"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListPage({ scope, budgets, loading, onRow, onNew, onRefresh, currentUser, onSign }) {
  const isPending      = scope === "pending";
  const isExpertReview = scope === "expert_review";
  const isCompleted    = scope === "approved";
  const role    = currentUser?.role || "viewer";
  const isAdmin = role === "admin";
  const canSign = role === "admin";

  const allPending = budgets.filter(b => PENDING_STATUSES.includes(b.status));
  const completed  = budgets.filter(b => COMPLETED_STATUSES.includes(b.status));

  const hasComment = (b) => !!(b.expertComment && b.expertComment.trim());

  // Split pending into three groups
  const aiReviewCases  = allPending.filter(b => b.status === "AI_REVIEW");
  const readyToSign    = allPending.filter(b => b.status !== "AI_REVIEW" && hasComment(b));
  const awaitingExpert = allPending.filter(b => b.status !== "AI_REVIEW" && !hasComment(b));

  const [q, setQ]           = React.useState("");
  const [aiFilter, setAiFilter] = React.useState("all");
  const [sort, setSort]     = React.useState({ k: "dispatchDate", dir: "desc" });
  const [cols, setCols]     = React.useState(DEFAULT_COLS);
  const [selected, setSelected] = React.useState(new Set());
  const [batchBusy, setBatchBusy] = React.useState(false);

  // 已簽核完成 extra filters
  const [filterStart, setFilterStart] = React.useState("");
  const [filterEnd,   setFilterEnd]   = React.useState("");
  const [filterCat,   setFilterCat]   = React.useState("");
  const [filterSys,   setFilterSys]   = React.useState("");

  // 已簽核完成 import/export + sheet picker
  const fileRef     = React.useRef();
  const [busy,      setBusy]      = React.useState(false);
  const [impMsg,    setImpMsg]    = React.useState("");
  const [sheetModal,setSheetModal]= React.useState(null); // null | { file, sheets, selected }

  const doExportCompleted = async () => {
    setBusy(true);
    try { await API.exportBudgets("completed", "csv"); }
    catch (e) { alert("匯出失敗：" + e.message); }
    finally { setBusy(false); }
  };

  const onImportFilePicked = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setImpMsg("");
    try {
      const { sheets } = await API.getImportSheets(file);
      if (sheets.length === 1) {
        await _runImport(file, sheets[0]);
      } else {
        setSheetModal({ file, sheets, selected: sheets[0] });
        setBusy(false);
      }
    } catch (err) {
      setImpMsg("⚠ 檔案解析失敗：" + err.message);
      setBusy(false);
    }
  };

  const doImportSheet = async () => {
    if (!sheetModal) return;
    const { file, selected } = sheetModal;
    setSheetModal(null);
    setBusy(true); setImpMsg("");
    await _runImport(file, selected);
  };

  const _runImport = async (file, sheet) => {
    try {
      const result = await API.importBudgets(file, { sheet, mode: "completed" });
      const cnt = result.inserted ?? result.created ?? 0;
      setImpMsg(`匯入完成：新增/更新 ${cnt} 筆，略過 ${result.skipped ?? 0} 筆` +
        (result.errors?.length ? `，${result.errors.length} 列錯誤` : ""));
      onRefresh && onRefresh();
    } catch (err) {
      setImpMsg("⚠ 匯入失敗：" + err.message);
    } finally {
      setBusy(false);
    }
  };

  // Persist column widths
  const storeKey = `pensieve.cols.${scope}`;
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
      if (saved && Array.isArray(saved) && saved.length === DEFAULT_COLS.length) {
        setCols(DEFAULT_COLS.map((c, i) => ({ ...c, w: saved[i] || c.w })));
      }
    } catch {}
  }, [storeKey]);
  const persistWidths = (next) => {
    try { localStorage.setItem(storeKey, JSON.stringify(next.map((c) => c.w))); } catch {}
  };

  const startColResize = (idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add("is-resizing");
    const target = e.currentTarget;
    target.classList.add("dragging");
    const startX = e.clientX;
    const startW = cols[idx].w;
    const min = cols[idx].min || 60;
    const onMove = (ev) => {
      const next = Math.max(min, Math.min(640, startW + (ev.clientX - startX)));
      setCols((c) => c.map((col, i) => i === idx ? { ...col, w: next } : col));
    };
    const onUp = () => {
      document.body.classList.remove("is-resizing");
      target.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setCols((c) => { persistWidths(c); return c; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const toggleSort = (k) => {
    setSort((s) => s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: "desc" });
  };
  const arr = (k) => sort.k === k ? (sort.dir === "asc" ? "▲" : "▼") : "▾";

  const applyView = React.useCallback((list) => {
    let r = list;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((b) =>
        (b.budgetNo || b.id || "").toLowerCase().includes(s) ||
        b.project.toLowerCase().includes(s) ||
        b.owner.name.includes(q) ||
        (b.expertName || "").includes(q) ||
        b.category.includes(q)
      );
    }
    if (aiFilter !== "all") r = r.filter((b) => b.aiResult === aiFilter);
    return [...r].sort((a, b) => {
      const av = a[sort.k], bv = b[sort.k];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [q, aiFilter, sort]);

  const readyToSignView   = React.useMemo(() => applyView(readyToSign),    [applyView, budgets]);
  const awaitingExpertView= React.useMemo(() => applyView(awaitingExpert), [applyView, budgets]);
  const aiReviewView      = React.useMemo(() => applyView(aiReviewCases),  [applyView, budgets]);
  const completedView     = React.useMemo(() => {
    let r = applyView(completed);
    if (filterStart) r = r.filter(b => b.signDate && b.signDate >= filterStart);
    if (filterEnd)   r = r.filter(b => b.signDate && b.signDate <= filterEnd + "T23:59:59");
    if (filterCat)   r = r.filter(b => b.category === filterCat);
    if (filterSys)   r = r.filter(b => b.subCategory === filterSys);
    return r;
  }, [applyView, budgets, filterStart, filterEnd, filterCat, filterSys]);

  // Cycle time by system (for 已簽核完成 dashboard)
  const cycleBySystem = React.useMemo(() => {
    const map = {};
    completedView.forEach(b => {
      const sys = b.subCategory || "（未分類）";
      if (!map[sys]) map[sys] = { total: 0, cnt: 0 };
      if (b.cycleTime != null) { map[sys].total += Number(b.cycleTime); map[sys].cnt++; }
    });
    return Object.entries(map)
      .map(([sys, d]) => ({ sys, avg: d.cnt ? Math.round(d.total / d.cnt * 10) / 10 : null, cnt: d.cnt }))
      .sort((a, bv) => (bv.avg ?? -1) - (a.avg ?? -1));
  }, [completedView]);

  // Batch sign
  const selectableIds = readyToSignView.map((b) => b.dbId);
  const allSelected  = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));
  const toggleAll    = () => setSelected(allSelected ? new Set() : new Set(selectableIds));
  const toggleRow    = (dbId) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(dbId) ? next.delete(dbId) : next.add(dbId);
    return next;
  });

  const doSign = async (b) => {
    try { await onSign(b); onRefresh && onRefresh(); }
    catch (e) { alert("簽核失敗：" + e.message); }
  };

  const batchSign = async () => {
    if (!selected.size) return;
    const toSign = readyToSignView.filter((b) => selected.has(b.dbId));
    if (!toSign.length) return;
    if (!confirm(`確定一鍵簽核 ${toSign.length} 件案件？`)) return;
    setBatchBusy(true);
    try {
      const res = await API.batchSign(toSign.map((b) => b.dbId));
      Toast.show(`✅ 已簽核 ${res.signed} 件`, "ok");
      setSelected(new Set());
    } catch (e) {
      Toast.show(`❌ 批次簽核失敗，已全部取消：${e.message}`, "err");
    } finally {
      setBatchBusy(false);
      onRefresh && onRefresh();
    }
  };

  // KPI counts
  const allDisplay  = isCompleted ? completedView
                    : isPending   ? readyToSignView
                    : /* expert */ awaitingExpertView;
  const totalAmt    = allDisplay.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const aiApprovedCnt = allDisplay.filter((b) => b.aiResult === "approve").length;
  const overSLA     = allDisplay.filter((b) => {
    if (!PENDING_STATUSES.includes(b.status)) return false;
    return (new Date() - new Date(b.dispatchDate)) / 86400000 > 3;
  }).length;

  const tableProps = { cols, sort, toggleSort, arr, startColResize, setCols, onRow };

  const pageTitle = isPending ? "待簽核案件" : isExpertReview ? "待專家審核案件" : "已簽核完成案件";
  const pageLede  = isPending
    ? "專家評論完成後進入待簽核，由系統管理員簽核結案"
    : isExpertReview
    ? "已派發案件在此等待專家填寫審核意見；填寫完成後自動進入待簽核流程"
    : "已完成完整審核流程之預算案件，可匯出稽核紀錄";

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{pageTitle}</h2>
          <div className="lede">{pageLede}</div>
        </div>
        <div className="actions">
          {isCompleted && (
            <>
              <button className="btn" onClick={doExportCompleted} disabled={busy || loading}>
                <Icon.Download/>匯出 CSV
              </button>
              <button className="btn" onClick={() => fileRef.current.click()} disabled={busy || loading}>
                <Icon.Upload/>匯入
              </button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={onImportFilePicked}/>
            </>
          )}
          <button className="btn" onClick={onRefresh} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi k-blue">
          <div className="glyph"><Icon.Inbox s={18}/></div>
          <div className="lbl">{isCompleted ? "近 30 日已核可" : isPending ? "待處理案件" : "待審核案件"}</div>
          <div className="val tnum">{allDisplay.length}<small>件</small></div>
          <div className="delta up">
            {isPending      ? `共 ${readyToSignView.length} 件待簽核` :
             isExpertReview ? `共 ${awaitingExpertView.length} 件待評論` :
             "已結案"}
          </div>
        </div>
        <div className="kpi k-purple">
          <div className="glyph"><Icon.Sparkles s={18}/></div>
          <div className="lbl">合計金額</div>
          <div className="val tnum">NT$ {fmtAmount(totalAmt)}</div>
          <div className="delta">本期度</div>
        </div>
        <div className="kpi k-green">
          <div className="glyph"><Icon.Check s={18}/></div>
          <div className="lbl">AI 建議核可</div>
          <div className="val tnum">{aiApprovedCnt}<small>/ {allDisplay.length}</small></div>
          <div className="delta">採納率 {allDisplay.length ? Math.round(aiApprovedCnt / allDisplay.length * 100) : 0}%</div>
        </div>
        <div className="kpi k-amber">
          <div className="glyph"><Icon.Bell s={18}/></div>
          <div className="lbl">超出 SLA (&gt; 3d)</div>
          <div className="val tnum">{overSLA}<small>件</small></div>
          <div className={`delta ${overSLA > 2 ? "down" : "up"}`}>{overSLA > 2 ? "▼ 注意" : "▲ 健康"}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon.Search/>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋預算單號、項目名稱、專家、負責人…" />
          <kbd>⌘K</kbd>
        </div>
        <div className="divider"/>
        <select className="field-sel" value={aiFilter} onChange={(e) => setAiFilter(e.target.value)}>
          <option value="all">全部 AI 結果</option>
          <option value="approve">AI 建議核可</option>
          <option value="reject">AI 建議退回</option>
          <option value="hold">AI 無法判定</option>
        </select>
        <div className="spacer-x"/>
        {isPending && canSign && selected.size > 0 && (
          <button className="btn accent" onClick={batchSign} disabled={batchBusy}>
            {batchBusy ? "簽核中…" : `一鍵簽核 (${selected.size})`}
          </button>
        )}
      </div>

      {/* ── 待簽核 main page — only cases ready for admin to sign ── */}
      {isPending && (
        <>
          <div className="block-head">
            <h3>待簽核 <span className="block-tag">專家評論完成，待簽核</span></h3>
            <span className="hint">{readyToSignView.length} 件</span>
          </div>
          <div className="table-wrap">
            {readyToSignView.length === 0 ? (
              <div className="empty">目前沒有待簽核案件</div>
            ) : (
              <BudgetTable
                {...tableProps}
                rows={readyToSignView}
                showSelect={canSign}
                selected={selected} onToggleRow={toggleRow} onToggleAll={toggleAll}
                allSelected={allSelected} someSelected={someSelected}
                showSign={canSign} onSign={doSign}
              />
            )}
          </div>
        </>
      )}

      {/* ── 待專家審核 page ── */}
      {isExpertReview && (
        <>
          <div className="block-head">
            <h3>待專家審核 <span className="block-tag">已派發，等待專家填寫評論</span></h3>
            <span className="hint">{awaitingExpertView.length} 件</span>
          </div>
          <div className="table-wrap">
            {awaitingExpertView.length === 0 ? (
              <div className="empty">🎉 目前沒有待審核案件</div>
            ) : (
              <BudgetTable
                cols={EXPERT_COLS}
                rows={awaitingExpertView}
                onRow={onRow}
                sort={sort} toggleSort={toggleSort} arr={arr}
                startColResize={startColResize} setCols={setCols}
              />
            )}
          </div>
        </>
      )}

      {/* ── 已簽核完成 page ── */}
      {isCompleted && (
        <>
          {impMsg && (
            <div style={{ padding: "8px 14px", background: impMsg.startsWith("⚠") ? "var(--bad-soft)" : "var(--ok-soft)",
                          color: impMsg.startsWith("⚠") ? "var(--bad)" : "var(--ok)",
                          borderRadius: "var(--radius)", fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              <span>{impMsg}</span>
              <button onClick={() => setImpMsg("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>✕</button>
            </div>
          )}

          {cycleBySystem.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-head">
                <h3>各系統 Cycle Time</h3>
                <span className="hint">平均審核天數（依目前篩選結果 {completedView.length} 件）</span>
              </div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {cycleBySystem.map(({ sys, avg, cnt }) => {
                  const col = avg == null ? "var(--text-muted)" : avg <= 1 ? "#10b981" : avg <= 3 ? "#f59e0b" : "#ef4444";
                  const pct = avg == null ? 0 : Math.min(100, (avg / 10) * 100);
                  return (
                    <div key={sys}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ color: "var(--text)", fontWeight: 500 }}>{sys}</span>
                        <span style={{ color: col, fontFamily: "monospace", fontWeight: 600 }}>
                          {avg != null ? `${avg}d` : "—"}
                          <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 6 }}>({cnt} 件)</span>
                        </span>
                      </div>
                      <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 4, transition: "width 0.4s ease" }}/>
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 16 }}>
                  <span style={{ color: "#10b981" }}>● ≤ 1 天（優）</span>
                  <span style={{ color: "#f59e0b" }}>● ≤ 3 天（達標）</span>
                  <span style={{ color: "#ef4444" }}>● &gt; 3 天（超時）</span>
                </div>
              </div>
            </div>
          )}

          <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>簽核日期</span>
            <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)}
              className="field-sel" style={{ width: 140 }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
            <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)}
              className="field-sel" style={{ width: 140 }} />
            <div className="divider" />
            <select className="field-sel" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">全部類別</option>
              {[...new Set(completed.map(b => b.category).filter(Boolean))].sort()
                .map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="field-sel" value={filterSys} onChange={e => setFilterSys(e.target.value)}>
              <option value="">全部系統</option>
              {[...new Set(completed.map(b => b.subCategory).filter(Boolean))].sort()
                .map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(filterStart || filterEnd || filterCat || filterSys) && (
              <button className="btn ghost sm" onClick={() => { setFilterStart(""); setFilterEnd(""); setFilterCat(""); setFilterSys(""); }}>
                清除篩選
              </button>
            )}
          </div>
          <div className="table-wrap" style={{ overflowY: "auto", maxHeight: 560 }}>
            {completedView.length === 0 ? (
              <div className="empty">查無符合條件之案件</div>
            ) : (
              <BudgetTable {...tableProps} rows={completedView} />
            )}
          </div>
        </>
      )}

      {/* ── Sheet picker modal (已簽核完成 import) ── */}
      {sheetModal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", zIndex: 300,
                      display: "grid", placeItems: "center" }}
             onClick={e => e.target === e.currentTarget && setSheetModal(null)}>
          <div className="card" style={{ width: 380, maxWidth: "92vw", padding: 0 }}>
            <div className="card-head" style={{ padding: "16px 20px" }}>
              <h3>選擇工作表</h3>
              <button className="btn ghost sm" onClick={() => setSheetModal(null)}>✕</button>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                此 Excel 包含多個工作表，請選擇要匯入的工作表：
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {sheetModal.sheets.map(s => (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                                          borderRadius: "var(--radius-sm)", cursor: "pointer",
                                          background: sheetModal.selected === s ? "var(--accent-soft)" : "var(--surface-2)",
                                          border: `1px solid ${sheetModal.selected === s ? "var(--accent)" : "var(--border)"}` }}>
                    <input type="radio" name="sheet-list" value={s} checked={sheetModal.selected === s}
                           onChange={() => setSheetModal(m => ({ ...m, selected: s }))}
                           style={{ accentColor: "var(--accent)" }}/>
                    <span style={{ fontSize: 13, fontWeight: sheetModal.selected === s ? 600 : 400 }}>{s}</span>
                  </label>
                ))}
              </div>
              <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button className="btn ghost" onClick={() => setSheetModal(null)}>取消</button>
                <button className="btn primary" onClick={doImportSheet} disabled={busy}>
                  {busy ? "匯入中…" : "確認匯入"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function renderCell(b, k) {
  switch (k) {
    case "week":         return <span className="week-pill">W{String(b.week).padStart(2, "0")}</span>;
    case "category":     return <CategoryChip id={b.categoryId} name={b.category}/>;
    case "subCategory":  return b.subCategory || <span style={{color:"var(--text-muted)"}}>—</span>;
    case "id":           return <span className="id-cell">{b.id}</span>;
    case "project":      return <span title={b.project}>{b.project}</span>;
    case "expertName":   return b.expertName || <span style={{color:"var(--text-muted)"}}>未指定</span>;
    case "owner":        return <OwnerCell owner={b.owner}/>;
    case "amount":       return fmtAmount(b.amount);
    case "aiResult":     return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span className="flex-row" style={{ gap: 6 }}>
          <ResultBadge result={b.aiResult} kind="ai"/>
          <Conf value={b.aiConfidence}/>
        </span>
        {b.aiReason && (
          <span className="flex-row" style={{ gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 195 }} title={b.aiReason}>
              {b.aiReason}
            </span>
            <CopyBtn text={b.aiReason} />
          </span>
        )}
      </div>
    );
    case "expertResult":  return <ResultBadge result={b.expertResult}/>;
    case "expertComment": return b.expertComment
      ? <span className="flex-row" style={{ gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }} title={b.expertComment}>
            {b.expertComment.length > 24 ? b.expertComment.slice(0, 24) + "…" : b.expertComment}
          </span>
          <CopyBtn text={b.expertComment} />
        </span>
      : <span style={{ color: "var(--text-muted)" }}>—</span>;
    case "status":       return <StatusBadge status={b.status}/>;
    case "dispatchDate": return MOCK.fmtDateShort(b.dispatchDate);
    case "signDate":     return b.signDate ? MOCK.fmtDateShort(b.signDate) : "—";
    case "cycle":        return <CycleTag disp={b.dispatchDate} sign={b.signDate}/>;
    default:             return null;
  }
}

window.ListPage = ListPage;
