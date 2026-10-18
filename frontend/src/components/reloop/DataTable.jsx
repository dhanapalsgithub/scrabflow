import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { TH, TD, TR, inputCls, selectSm } from "@/lib/format";
import { Panel, ExportButton } from "@/components/reloop/Primitives";

const cellValue = (col, row) => (col.render ? col.render(row) : row[col.key] ?? "—");

function filterRows(rows, { q, from, to, dateKey, searchKeys }) {
  const needle = q.trim().toLowerCase();
  const t0 = from ? new Date(`${from}T00:00:00`) : null;
  const t1 = to ? new Date(`${to}T23:59:59`) : null;
  return rows.filter((r) => {
    if (dateKey && (t0 || t1)) {
      const d = new Date(r[dateKey]);
      if (isNaN(d) || (t0 && d < t0) || (t1 && d > t1)) return false;
    }
    return !needle || searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle));
  });
}

const Toolbar = ({ q, setQ, from, setFrom, to, setTo, dateKey, filters, testId }) => (
  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 lg:flex-row lg:flex-wrap lg:items-center">
    <div className="relative w-full lg:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input data-testid={`${testId}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records" className={`${inputCls} h-10 pl-9`} />
    </div>
    {dateKey && (
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <label className="relative flex items-center">
          <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input type="date" data-testid={`${testId}-from-date`} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} h-10 pl-9 text-xs`} aria-label="From date" />
        </label>
        <label className="relative flex items-center">
          <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input type="date" data-testid={`${testId}-to-date`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputCls} h-10 pl-9 text-xs`} aria-label="To date" />
        </label>
      </div>
    )}
    {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
    {(q || from || to) && (
      <button type="button" data-testid={`${testId}-clear-filters`} onClick={() => { setQ(""); setFrom(""); setTo(""); }}
        className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100">
        <X className="h-3.5 w-3.5" /> Clear
      </button>
    )}
  </div>
);

const Pager = ({ page, pages, size, setSize, setPage, total, testId }) => (
  <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:px-6">
    <div className="flex items-center gap-2">
      <span data-testid={`${testId}-total`}>{total} records</span>
      <select data-testid={`${testId}-page-size`} value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className={selectSm}>
        {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
      </select>
    </div>
    <div className="flex items-center gap-1">
      <button type="button" data-testid={`${testId}-prev-page`} disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
      <span className="px-2 font-mono font-bold text-slate-700" data-testid={`${testId}-page-indicator`}>{page} / {pages}</span>
      <button type="button" data-testid={`${testId}-next-page`} disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
    </div>
  </div>
);

const MobileCards = ({ columns, rows, rowKey, testId }) => (
  <div className="divide-y divide-slate-100 md:hidden">
    {rows.map((r) => {
      const [first, ...rest] = columns;
      return (
        <div key={r[rowKey]} className="space-y-3 px-4 py-4" data-testid={`${testId}-card-${r[rowKey]}`}>
          <div>{cellValue(first, r)}</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {rest.map((c) => (
              <div key={c.label} className={c.wide ? "col-span-2" : ""}>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</dt>
                <dd className="mt-0.5 break-words text-sm text-slate-700">{cellValue(c, r)}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    })}
  </div>
);

export const DataTable = ({ columns, rows = [], dateKey = "created_at", searchKeys = [], exportName, exportColumns, filters, title, subtitle, actions, rowKey = "id", testId = "data-table", pageSize = 10, emptyText = "No records found" }) => {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const filtered = useMemo(() => filterRows(rows, { q, from, to, dateKey, searchKeys }), [rows, q, from, to, dateKey, searchKeys]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages);
  const visible = filtered.slice((cur - 1) * size, cur * size);
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  const headerActions = (actions || exportName) && (
    <>{actions}{exportName && <ExportButton filename={exportName} columns={exportColumns} rows={filtered} testId={`${testId}-export-btn`} />}</>
  );

  return (
    <Panel title={title} subtitle={subtitle} actions={headerActions} bodyClass="p-0" testId={testId}>
      <Toolbar q={q} setQ={reset(setQ)} from={from} setFrom={reset(setFrom)} to={to} setTo={reset(setTo)} dateKey={dateKey} filters={filters} testId={testId} />
      {visible.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-slate-400" data-testid={`${testId}-empty`}>{emptyText}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80"><tr>{columns.map((c) => <th key={c.label} className={TH}>{c.label}</th>)}</tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r[rowKey]} className={TR} data-testid={`${testId}-row-${r[rowKey]}`}>
                    {columns.map((c) => <td key={c.label} className={`${TD} ${c.className || ""}`}>{cellValue(c, r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MobileCards columns={columns} rows={visible} rowKey={rowKey} testId={testId} />
        </>
      )}
      <Pager page={cur} pages={pages} size={size} setSize={setSize} setPage={setPage} total={filtered.length} testId={testId} />
    </Panel>
  );
};
