import { Download, IndianRupee, Weight, Hash, Activity, Loader2 } from "lucide-react";
import { fmtValue, btnGhost, slug } from "@/lib/format";
import { exportCSV } from "@/lib/csv";

const STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Accepted: "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-violet-50 text-violet-700 border-violet-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  Inactive: "bg-slate-100 text-slate-600 border-slate-200",
};

export const StatusBadge = ({ status, testId }) => (
  <span data-testid={testId} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.Inactive}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {status}
  </span>
);

const ICONS = { inr: IndianRupee, kg: Weight, number: Hash, text: Activity };

export const MetricCard = ({ label, value, format, hint, index = 0, testId }) => {
  const Icon = ICONS[format] || Activity;
  return (
    <div data-testid={testId || `metric-${slug(label)}`} className="rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Icon className="h-4 w-4" /></span>
      </div>
      <p className={`mt-3 font-mono font-extrabold tracking-tight text-slate-900 ${format === "text" ? "text-xl" : "text-2xl lg:text-[1.7rem]"}`} data-testid={`${testId || `metric-${slug(label)}`}-value`}>
        {fmtValue(value, format)}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
};

export const Panel = ({ title, subtitle, actions, children, className = "", bodyClass = "p-6", testId }) => (
  <section data-testid={testId} className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
    {(title || actions) && (
      <header className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={bodyClass}>{children}</div>
  </section>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="rise mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-4xl" data-testid="page-title">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-500 md:text-base">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

export const ExportButton = ({ filename, columns, rows, testId }) => (
  <button type="button" data-testid={testId || `export-${filename}-btn`} className={btnGhost} onClick={() => exportCSV(filename, columns, rows || [])} disabled={!rows?.length}>
    <Download className="h-4 w-4" /> Export CSV
  </button>
);

export const LoadingBlock = () => (
  <div className="grid place-items-center py-24 text-slate-400" data-testid="loading-indicator">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

export const EmptyRow = ({ cols, text = "No records found" }) => (
  <tr>
    <td colSpan={cols} className="px-4 py-14 text-center text-sm text-slate-400" data-testid="empty-state">{text}</td>
  </tr>
);

export const OrderId = ({ id }) => (
  <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-slate-700">{id}</span>
);
