/* Budget list page — resizable columns */

const DEFAULT_COLS = [
  { k: "week",        label: "週數",         w: 78,  sortable: true,  min: 60 },
  { k: "category",    label: "類別",         w: 130, min: 100 },
  { k: "id",          label: "預算單號",     w: 170, min: 130 },
  { k: "project",     label: "項目名稱",     w: 280, min: 160 },
  { k: "owner",       label: "預算負責人",   w: 170, min: 140 },
  { k: "amount",      label: "金額 (NT$)",   w: 130, sortable: true, min: 110, align: "right" },
  { k: "aiResult",    label: "AI 審核處置",  w: 230, min: 180 },
  { k: "expertResult",label: "專家審核處置", w: 130, min: 110 },
  { k: "status",      label: "狀態",         w: 110, min: 90 },
  { k: "dispatchDate",label: "派送日期",     w: 130, sortable: true, min: 110 },
  { k: "signDate",    label: "簽核日期",     w: 130, min: 110 },
  { k: "cycle",       label: "Cycle Time",   w: 110, min: 90 },
];

const PENDING_STATUSES   = ["AI_REVIEW", "EXPERT_REVIEW", "PENDING_ACTION"];
const COMPLETED_STATUSES = ["CLOSED", "REJECTED"];

function ListPage({ scope, budgets, loading, onRow, onNew, onRefresh }) {
  const isPending = scope === "pending";
  // API already scopes the data; client-side filter is a safety net
  const filtered = budgets.filter((b) =>
    isPending ? PENDING_STATUSES.includes(b.status)
              : COMPLETED_STATUSES.includes(b.status)
  );

  const [q, setQ] = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");
  const [aiFilter, setAiFilter] = React.useState("all");
  const [sort, setSort] = React.useState({ k: "dispatchDate", dir: "desc" });
  const [cols, setCols] = React.useState(DEFAULT_COLS);

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

  const resetCols = () => {
    setCols(DEFAULT_COLS);
    try { localStorage.removeItem(storeKey); } catch {}
  };

  const rows = React.useMemo(() => {
    let r = filtered;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((b) =>
        b.id.toLowerCase().includes(s) ||
        b.project.toLowerCase().includes(s) ||
        b.owner.name.includes(q) ||
        b.category.includes(q)
      );
    }
    if (catFilter !== "all") r = r.filter((b) => b.categoryId === catFilter);
    if (aiFilter !== "all") r = r.filter((b) => b.aiResult === aiFilter);
    r = [...r].sort((a, b) => {
      const av = a[sort.k], bv = b[sort.k];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [filtered, q, catFilter, aiFilter, sort]);

  const toggleSort = (k) => {
    setSort((s) => s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: "desc" });
  };
  const arr = (k) => sort.k === k ? (sort.dir === "asc" ? "▲" : "▼") : "▾";

  const totalAmt = rows.reduce((s, b) => s + b.amount, 0);
  const aiApprovedCnt = rows.filter((b) => b.aiResult === "approve").length;
  const overSLA = rows.filter((b) => {
    if (!PENDING_STATUSES.includes(b.status)) return false;
    const ref = new Date();
    return (ref - b.dispatchDate) / 86400000 > 3;
  }).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{isPending ? "待簽核案件" : "已簽核完成案件"}</h2>
          <div className="lede">
            {isPending
              ? "AI 已完成初審，等待專家依據建議決策進行最終簽核"
              : "已完成完整審核流程之預算案件，可匯出稽核紀錄"}
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={onRefresh} disabled={loading}><Icon.Refresh/>{loading ? "載入中…" : "重新整理"}</button>
          <button className="btn"><Icon.Download/>匯出 CSV</button>
          {isPending && (
            <button className="btn accent" onClick={onNew}>
              <Icon.Plus/>建立預算單
            </button>
          )}
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi k-blue">
          <div className="glyph"><Icon.Inbox s={18}/></div>
          <div className="lbl">{isPending ? "待處理案件" : "近 30 日已核可"}</div>
          <div className="val tnum">{rows.length}<small>件</small></div>
          <div className="delta up">▲ 12% vs 上週</div>
        </div>
        <div className="kpi k-purple">
          <div className="glyph"><Icon.Sparkles s={18}/></div>
          <div className="lbl">合計金額</div>
          <div className="val tnum">NT$ {fmtAmount(Math.round(totalAmt / 1000))}<small>K</small></div>
          <div className="delta">本期度</div>
        </div>
        <div className="kpi k-green">
          <div className="glyph"><Icon.Check s={18}/></div>
          <div className="lbl">AI 建議核可</div>
          <div className="val tnum">{aiApprovedCnt}<small>/ {rows.length}</small></div>
          <div className="delta">採納率 {rows.length ? Math.round(aiApprovedCnt / rows.length * 100) : 0}%</div>
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
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋預算單號、項目名稱、負責人…"
          />
          <kbd>⌘K</kbd>
        </div>
        <div className="divider"/>
        <select className="field-sel" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">全部類別</option>
          {MOCK.CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="field-sel" value={aiFilter} onChange={(e) => setAiFilter(e.target.value)}>
          <option value="all">全部 AI 結果</option>
          <option value="approve">AI 建議核可</option>
          <option value="reject">AI 建議退回</option>
          <option value="hold">AI 無法判定</option>
        </select>
        <div className="spacer-x"/>
        <button className="btn sm ghost" onClick={resetCols} title="還原欄寬">↺ 還原欄寬</button>
        <span className="hint">{rows.length} / {filtered.length} 筆</span>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">查無符合條件之案件</div>
        ) : (
          <div className="table-scroll">
            <table className="dt" style={{ width: cols.reduce((s, c) => s + c.w, 0) }}>
              <colgroup>
                {cols.map((c) => <col key={c.k} style={{ width: c.w }}/>)}
              </colgroup>
              <thead>
                <tr>
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
                            setCols((cs) => cs.map((col, i) => i === idx ? { ...col, w: DEFAULT_COLS[idx].w } : col));
                          }}
                          title="拖曳調整欄寬，雙擊重設"
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} onClick={() => onRow(b)}>
                    {cols.map((c) => (
                      <td key={c.k} style={{ textAlign: c.align || "left" }} className={
                        c.k === "amount" ? "col-amt" :
                        (c.k === "dispatchDate" || c.k === "signDate") ? "col-date" : ""
                      }>
                        {renderCell(b, c.k)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function renderCell(b, k) {
  switch (k) {
    case "week":         return <span className="week-pill">W{String(b.week).padStart(2, "0")}</span>;
    case "category":     return <CategoryChip id={b.categoryId} name={b.category}/>;
    case "id":           return <span className="id-cell">{b.id}</span>;
    case "project":      return <span title={b.project}>{b.project}</span>;
    case "owner":        return <OwnerCell owner={b.owner}/>;
    case "amount":       return fmtAmount(b.amount);
    case "aiResult":     return (
      <span className="flex-row" style={{ gap: 6 }}>
        <ResultBadge result={b.aiResult} kind="ai"/>
        <Conf value={b.aiConfidence}/>
      </span>
    );
    case "expertResult": return <ResultBadge result={b.expertResult}/>;
    case "status":       return <StatusBadge status={b.status}/>;
    case "dispatchDate": return MOCK.fmtDateShort(b.dispatchDate);
    case "signDate":     return b.signDate ? MOCK.fmtDateShort(b.signDate) : "—";
    case "cycle":        return <CycleTag disp={b.dispatchDate} sign={b.signDate}/>;
    default:             return null;
  }
}

window.ListPage = ListPage;
