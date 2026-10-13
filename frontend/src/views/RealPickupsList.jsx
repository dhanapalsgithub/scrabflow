import { useState } from "react";
import { toast } from "sonner";
import { Search, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate, TH, TD, TR, STATUSES, selectSm, inputCls } from "@/lib/format";
import { Panel, PageHeader, StatusBadge, LoadingBlock, EmptyRow, OrderId, ExportButton, MetricCard } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";
import { PICKUP_COLUMNS } from "@/views/UserPickupsList";

const sum = (rows, pred) => rows.filter(pred).reduce((a, p) => a + p.amount, 0);

export default function RealPickupsList({ mode = "all" }) {
  const { user } = useAuth();
  const canEdit = ["delivery_partner", "admin"].includes(user.role);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [district, setDistrict] = useState("All");
  const { data, loading, refresh, setData, lastSync } = usePolling(() =>
    api.get("/scrap/pickups/all", { params: { role: user.role, email: undefined, assigned: mode === "assigned" ? "me" : undefined } }).then((r) => r.data)
  );

  const update = async (id, next) => {
    try {
      const { data: updated } = await api.put(`/scrap/pickups/${id}/status`, { status: next });
      setData((rows) => rows.map((r) => (r.id === id ? updated : r)));
      toast.success(`Order ${id} → ${next}`);
    } catch (err) {
      toast.error(formatApiError(err));
      refresh();
    }
  };

  if (loading && !data) return <LoadingBlock />;
  const all = data || [];
  const districts = [...new Set(all.map((p) => p.district))].sort();
  const needle = q.trim().toLowerCase();
  const rows = all.filter((p) =>
    (status === "All" || p.status === status) && (district === "All" || p.district === district) &&
    (!needle || [p.id, p.customer_email, p.material, p.address].some((v) => String(v).toLowerCase().includes(needle)))
  );
  const metrics = [
    { label: "Total Volume Amount", value: sum(all, (p) => p.status !== "Cancelled"), format: "inr", hint: `${all.length} orders`, key: "total" },
    { label: "Total Paid / Settled", value: sum(all, (p) => p.status === "Completed"), format: "inr", hint: "Completed orders", key: "paid" },
    { label: "Pending Disbursements", value: sum(all, (p) => ["Pending", "Accepted", "In Progress"].includes(p.status)), format: "inr", hint: "Open orders", key: "pending" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={mode === "assigned" ? "My Assignments" : "Pickup Requests"}
        subtitle={mode === "assigned" ? "Orders you have accepted. Move them through the pipeline to settle payouts." : "Every customer pickup across all districts, synced live."}>
        <LiveSync lastSync={lastSync} onRefresh={refresh} />
        <ExportButton filename={mode === "assigned" ? "my-assignments" : "all-pickups"} columns={PICKUP_COLUMNS} rows={rows} />
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((m, i) => <MetricCard key={m.key} {...m} index={i} testId={`pickups-metric-${m.key}`} />)}
      </div>

      <Panel bodyClass="p-0" testId="real-pickups-table"
        title={`${rows.length} orders`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input data-testid="pickups-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, email, address" className={`${inputCls} h-10 w-60 pl-9`} />
            </div>
            <select data-testid="pickups-status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectSm} h-10`}>
              {["All", ...STATUSES].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select data-testid="pickups-district-filter" value={district} onChange={(e) => setDistrict(e.target.value)} className={`${selectSm} h-10`}>
              {["All", ...districts].map((s) => <option key={s}>{s}</option>)}
            </select>
          </>
        }>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/80">
              <tr>{["Order ID", "Material", "Weight (kg)", "Total Amount", "Customer Email", "District & Address", "Status", "Date", canEdit ? "Action" : null].filter(Boolean).map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={9} />}
              {rows.map((p) => {
                const locked = user.role !== "admin" && ["Completed", "Cancelled"].includes(p.status);
                return (
                  <tr key={p.id} className={TR} data-testid={`pickup-row-${p.id}`}>
                    <td className={TD}><OrderId id={p.id} /></td>
                    <td className={TD}>{p.material}</td>
                    <td className={`${TD} font-mono font-bold`}>{kg(p.weight_kg)}</td>
                    <td className={`${TD} font-mono font-bold text-slate-900`}>{inr(p.amount)}</td>
                    <td className={TD}>{p.customer_email}</td>
                    <td className={TD}><p className="font-medium">{p.district}</p><p className="max-w-[220px] truncate text-xs text-slate-500">{p.address}</p></td>
                    <td className={TD}>
                      {canEdit && !locked ? (
                        <select data-testid={`status-select-${p.id}`} value={p.status} onChange={(e) => update(p.id, e.target.value)} className={selectSm}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : <StatusBadge status={p.status} testId={`pickup-status-${p.id}`} />}
                    </td>
                    <td className={`${TD} text-slate-500`}>{fmtDate(p.created_at)}</td>
                    {canEdit && (
                      <td className={TD}>
                        {p.status === "Pending" ? (
                          <button type="button" data-testid={`accept-order-${p.id}`} onClick={() => update(p.id, "Accepted")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Accept Order
                          </button>
                        ) : <span className="text-xs text-slate-400">{p.assigned_to ? `by ${p.assigned_to.split("@")[0]}` : "—"}</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
