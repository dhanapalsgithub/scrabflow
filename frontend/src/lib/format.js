const num = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: d });

export const inr = (n) => `₹${num(n)}`;
export const kg = (n) => `${num(n)} kg`;
export const fmtDate = (s) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtValue = (v, f) => (f === "inr" ? inr(v) : f === "kg" ? kg(v) : f === "number" ? num(v, 0) : v);

export const STATUSES = ["Pending", "Accepted", "In Progress", "Completed", "Cancelled"];
export const MATERIALS = ["Mixed Paper", "Plastics", "E-Waste", "Metals"];

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const inputCls =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";
export const selectSm =
  "h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500";
export const TH = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap";
export const TD = "px-4 py-3.5 text-sm text-slate-700 whitespace-nowrap";
export const TR = "border-b border-slate-100 hover:bg-slate-50/60 transition-colors";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 h-10 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 h-10 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50";
