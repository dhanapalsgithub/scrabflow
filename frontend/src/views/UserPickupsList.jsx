import { useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate, STATUSES, slug } from "@/lib/format";
import { PageHeader, StatusBadge, LoadingBlock } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";
import { DataTable } from "@/components/reloop/DataTable";
import { PickupTimeline, TrackButton } from "@/components/reloop/PickupTimeline";
import { payOnline } from "@/lib/razorpay";

const PayCell = ({ p, onPaid }) => {
  if (p.payment_status === "paid") return <span className="text-xs font-semibold text-emerald-700" data-testid={`payment-status-${p.id}`}>Fee paid</span>;
  if (p.payment_status !== "pending" || p.status === "Cancelled") return <span className="text-xs text-slate-400">No fee</span>;
  if (p.payment_method === "online") return (
    <button type="button" data-testid={`pay-now-${p.id}`} onClick={() => payOnline(p.id, onPaid)} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">Pay {inr(p.service_fee)}</button>
  );
  return <span className="text-xs text-amber-700" data-testid={`payment-status-${p.id}`}>{inr(p.service_fee)} cash at pickup</span>;
};

export const PICKUP_COLUMNS = [
  { label: "Order ID", key: "id" }, { label: "Material", key: "material" }, { label: "Weight (kg)", key: "weight_kg" },
  { label: "Rate (INR/kg)", key: "rate" }, { label: "Total Amount (INR)", key: "amount" }, { label: "Customer Email", key: "customer_email" },
  { label: "District", key: "district" }, { label: "Address", key: "address" }, { label: "Status", key: "status" },
  { label: "Assigned To", key: "assigned_to" }, { label: "Created", key: "created_at" },
];

export default function UserPickupsList() {
  const FINAL_OTP = ["Completed", "Cancelled"];
  const [filter, setFilter] = useState("All");
  const [tracking, setTracking] = useState(null);
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
  const columns = [
    { label: "Order ID", render: (p) => <TrackButton id={p.id} onClick={() => setTracking(p.id)} /> },
    { label: "Material", key: "material" },
    { label: "Weight", render: (p) => <span className="font-mono font-bold">{kg(p.weight_kg)}</span> },
    { label: "Earnings", render: (p) => <span className="font-mono font-bold text-slate-900">{inr(p.amount)}</span> },
    { label: "District & Address", wide: true, render: (p) => <><p className="font-medium">{p.district}</p><p className="max-w-[240px] truncate text-xs text-slate-500">{p.address}</p></> },
    { label: "Status", render: (p) => <StatusBadge status={p.status} testId={`user-pickup-status-${p.id}`} /> },
    { label: "Pickup OTP", render: (p) => FINAL_OTP.includes(p.status) ? <span className="text-xs text-slate-400">—</span> : <span className="rounded-md bg-slate-950 px-2 py-1 font-mono text-sm font-bold tracking-[0.3em] text-emerald-400" data-testid={`pickup-otp-${p.id}`}>{p.otp}</span> },
    { label: "Payment", render: (p) => <PayCell p={p} onPaid={refresh} /> },
    { label: "Partner", render: (p) => p.assigned_name ? <><p className="text-sm">{p.assigned_name}</p><p className="font-mono text-xs text-slate-500">{p.assigned_vehicle}</p></> : <span className="text-xs text-slate-400">Not assigned</span> },
    { label: "Date", render: (p) => <span className="text-slate-500">{fmtDate(p.created_at)}</span> },
    { label: "Action", render: (p) => p.status === "Pending" ? (
      <button type="button" onClick={() => cancel(p.id)} data-testid={`cancel-pickup-${p.id}`} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50">Cancel</button>
    ) : <span className="text-xs text-slate-400">—</span> },
  ];

  return (
    <div>
      <PageHeader title="My Pickups" subtitle="Status updates from our delivery partners appear here automatically.">
        <LiveSync lastSync={lastSync} onRefresh={refresh} />
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2" data-testid="status-filter-tabs">
        {["All", ...STATUSES].map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} data-testid={`filter-${slug(s)}`}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${filter === s ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {s} <span className="ml-1 font-mono opacity-70">{s === "All" ? data.length : data.filter((p) => p.status === s).length}</span>
          </button>
        ))}
      </div>
      <DataTable testId="user-pickups-table" columns={columns} rows={rows} searchKeys={["id", "material", "district", "address", "assigned_name"]}
        exportName="my-pickups" exportColumns={PICKUP_COLUMNS} emptyText="No pickups in this view" />
      {tracking && <PickupTimeline pickupId={tracking} onClose={() => setTracking(null)} />}
    </div>
  );
}
