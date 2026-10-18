import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate, STATUSES, selectSm } from "@/lib/format";
import { PageHeader, StatusBadge, LoadingBlock, MetricCard } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";
import { DataTable } from "@/components/reloop/DataTable";
import { PickupTimeline, TrackButton } from "@/components/reloop/PickupTimeline";
import { KycBanner } from "@/views/VerificationView";
import { PICKUP_COLUMNS } from "@/views/UserPickupsList";

const FINAL = ["Completed", "Cancelled"];
const DELIVERY_OPTIONS = { Accepted: ["Accepted", "In Progress", "Pending"], "In Progress": ["In Progress", "Completed", "Pending"] };

const sum = (rows, pred) => rows.filter(pred).reduce((a, p) => a + p.amount, 0);

export default function RealPickupsList({ mode = "all" }) {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const isDelivery = user.role === "delivery_partner";
  const verified = isDelivery && user.kyc?.status === "verified";
  const [status, setStatus] = useState("All");
  const [district, setDistrict] = useState("All");
  const [tracking, setTracking] = useState(null);
  const [partners, setPartners] = useState([]);
  useEffect(() => {
    if (isAdmin) api.get("/admin/delivery-partners").then((r) => setPartners(r.data));
  }, [isAdmin]);
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

  const assign = async (id, email) => {
    try {
      const { data: updated } = await api.put(`/scrap/pickups/${id}/assign`, { delivery_email: email });
      setData((rows) => rows.map((r) => (r.id === id ? updated : r)));
      toast.success(`Order ${id} assigned to ${updated.assigned_name}`);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (loading && !data) return <LoadingBlock />;
  const all = data || [];
  const districts = [...new Set(all.map((p) => p.district))].sort();
  const rows = all.filter((p) => (status === "All" || p.status === status) && (district === "All" || p.district === district));
  const canChange = (p) => (isAdmin && !FINAL.includes(p.status)) || (verified && p.assigned_to === user.email && !FINAL.includes(p.status));
  const columns = [
    { label: "Order ID", render: (p) => <TrackButton id={p.id} onClick={() => setTracking(p.id)} /> },
    { label: "Material", key: "material" },
    { label: "Weight (kg)", render: (p) => <span className="font-mono font-bold">{kg(p.weight_kg)}</span> },
    { label: "Total Amount", render: (p) => <span className="font-mono font-bold text-slate-900">{inr(p.amount)}</span> },
    { label: "Customer Email", key: "customer_email" },
    { label: "District & Address", wide: true, render: (p) => <><p className="font-medium">{p.district}</p><p className="max-w-[220px] truncate text-xs text-slate-500">{p.address}</p></> },
    { label: "Status", render: (p) => canChange(p) ? (
      <select data-testid={`status-select-${p.id}`} value={p.status} onChange={(e) => update(p.id, e.target.value)} className={selectSm}>
        {(isAdmin ? STATUSES : DELIVERY_OPTIONS[p.status] || [p.status]).map((s) => <option key={s} value={s}>{s === "Pending" && !isAdmin ? "Release to pool" : s}</option>)}
      </select>
    ) : <StatusBadge status={p.status} testId={`pickup-status-${p.id}`} /> },
    { label: "Date", render: (p) => <span className="text-slate-500">{fmtDate(p.created_at)}</span> },
  ];
  if (isAdmin) columns.push({ label: "Assign Partner", render: (p) => FINAL.includes(p.status) ? <span className="text-xs text-slate-500">{p.assigned_name || "—"}</span> : (
    <select data-testid={`assign-select-${p.id}`} value={p.assigned_to || ""} onChange={(e) => e.target.value && assign(p.id, e.target.value)} className={`${selectSm} max-w-[180px]`}>
      <option value="">{partners.length ? "Select partner" : "No verified partners"}</option>
      {partners.map((d) => <option key={d.email} value={d.email}>{d.name} · {d.vehicle_number}</option>)}
    </select>) });
  if (isDelivery) columns.push({ label: "Action", render: (p) => p.status === "Pending" && !p.assigned_to ? (
    <button type="button" disabled={!verified} data-testid={`accept-order-${p.id}`} onClick={() => update(p.id, "Accepted")} title={verified ? "" : "Complete verification first"}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
      <CheckCircle2 className="h-3.5 w-3.5" /> Accept Order
    </button>) : <span className="text-xs text-slate-400">{p.assigned_to === user.email ? "Assigned to you" : "—"}</span> });
  if (!isAdmin && !isDelivery) columns.push({ label: "Partner", render: (p) => <span className="text-xs">{p.assigned_name || "—"}</span> });
  const metrics = [
    { label: "Total Volume Amount", value: sum(all, (p) => p.status !== "Cancelled"), format: "inr", hint: `${all.length} orders`, key: "total" },
    { label: "Total Paid / Settled", value: sum(all, (p) => p.status === "Completed"), format: "inr", hint: "Completed orders", key: "paid" },
    { label: "Pending Disbursements", value: sum(all, (p) => ["Pending", "Accepted", "In Progress"].includes(p.status)), format: "inr", hint: "Open orders", key: "pending" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={mode === "assigned" ? "My Assignments" : "Pickup Requests"}
        subtitle={mode === "assigned" ? "Orders you have accepted. Move them through the pipeline to settle payouts." : isDelivery ? "Pickups available to you and orders assigned to you." : "Every customer pickup across districts, synced live."}>
        <LiveSync lastSync={lastSync} onRefresh={refresh} />
      </PageHeader>

      {isDelivery && !verified && (
        <div className="space-y-2"><KycBanner kyc={user.kyc} />
          <Link to="/dashboard/verification" className="inline-block text-sm font-semibold text-emerald-700 underline" data-testid="go-verification-link">Go to Verification →</Link></div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((m, i) => <MetricCard key={m.key} {...m} index={i} testId={`pickups-metric-${m.key}`} />)}
      </div>

      <DataTable testId="real-pickups-table" title="Orders" columns={columns} rows={rows}
        searchKeys={["id", "customer_email", "material", "address", "district", "assigned_name"]}
        exportName={mode === "assigned" ? "my-assignments" : "all-pickups"} exportColumns={PICKUP_COLUMNS}
        filters={
          <>
            <select data-testid="pickups-status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectSm} h-10`}>
              {["All", ...STATUSES].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select data-testid="pickups-district-filter" value={district} onChange={(e) => setDistrict(e.target.value)} className={`${selectSm} h-10`}>
              {["All", ...districts].map((s) => <option key={s}>{s}</option>)}
            </select>
          </>
        } />
      {tracking && <PickupTimeline pickupId={tracking} onClose={() => setTracking(null)} />}
    </div>
  );
}
