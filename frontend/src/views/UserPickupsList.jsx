import { useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate, TH, TD, TR, STATUSES, slug } from "@/lib/format";
import { Panel, PageHeader, StatusBadge, LoadingBlock, EmptyRow, OrderId, ExportButton } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";

export const PICKUP_COLUMNS = [
  { label: "Order ID", key: "id" }, { label: "Material", key: "material" }, { label: "Weight (kg)", key: "weight_kg" },
  { label: "Rate (INR/kg)", key: "rate" }, { label: "Total Amount (INR)", key: "amount" }, { label: "Customer Email", key: "customer_email" },
  { label: "District", key: "district" }, { label: "Address", key: "address" }, { label: "Status", key: "status" },
  { label: "Assigned To", key: "assigned_to" }, { label: "Created", key: "created_at" },
];

export default function UserPickupsList() {
  const [filter, setFilter] = useState("All");
  const { data, loading, refresh, lastSync } = usePolling(() => api.get("/scrap/pickups/all").then((r) => r.data));

  const cancel = async (id) => {
    try {
      await api.put(`/scrap/pickups/${id}/status`, { status: "Cancelled" });
      toast.success(`Pickup ${id} cancelled`);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (loading && !data) return <LoadingBlock />;
  const rows = (data || []).filter((p) => filter === "All" || p.status === filter);

  return (
    <div>
      <PageHeader title="My Pickups" subtitle="Status updates from our delivery partners appear here automatically.">
        <LiveSync lastSync={lastSync} onRefresh={refresh} />
        <ExportButton filename="my-pickups" columns={PICKUP_COLUMNS} rows={rows} />
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2" data-testid="status-filter-tabs">
        {["All", ...STATUSES].map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} data-testid={`filter-${slug(s)}`}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${filter === s ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {s} <span className="ml-1 font-mono opacity-70">{s === "All" ? data.length : data.filter((p) => p.status === s).length}</span>
          </button>
        ))}
      </div>
      <Panel bodyClass="p-0" testId="user-pickups-table">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/80"><tr>{["Order ID", "Material", "Weight", "Earnings", "District & Address", "Status", "Date", "Action"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={8} text="No pickups in this view" />}
              {rows.map((p) => (
                <tr key={p.id} className={TR} data-testid={`user-pickup-row-${p.id}`}>
                  <td className={TD}><OrderId id={p.id} /></td>
                  <td className={TD}>{p.material}</td>
                  <td className={`${TD} font-mono font-bold`}>{kg(p.weight_kg)}</td>
                  <td className={`${TD} font-mono font-bold text-slate-900`}>{inr(p.amount)}</td>
                  <td className={TD}><p className="font-medium">{p.district}</p><p className="max-w-[240px] truncate text-xs text-slate-500">{p.address}</p></td>
                  <td className={TD}><StatusBadge status={p.status} testId={`user-pickup-status-${p.id}`} /></td>
                  <td className={`${TD} text-slate-500`}>{fmtDate(p.created_at)}</td>
                  <td className={TD}>
                    {p.status === "Pending" ? (
                      <button type="button" onClick={() => cancel(p.id)} data-testid={`cancel-pickup-${p.id}`} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50">Cancel</button>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
