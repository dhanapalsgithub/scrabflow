import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate, STATUSES, inputCls, btnPrimary } from "@/lib/format";
import { UiSelect } from "@/components/reloop/Fields";
import { PageHeader, StatusBadge, LoadingBlock, MetricCard } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";
import { DataTable } from "@/components/reloop/DataTable";
import { PickupTimeline, TrackButton } from "@/components/reloop/PickupTimeline";
import { KycBanner } from "@/views/VerificationView";
import { PICKUP_COLUMNS } from "@/views/UserPickupsList";

const FINAL = ["Completed", "Cancelled"];
const DELIVERY_OPTIONS = { Accepted: ["Accepted", "In Progress", "Pending"], "In Progress": ["In Progress", "Completed", "Pending"] };

const sum = (rows, pred) => rows.filter(pred).reduce((a, p) => a + p.amount, 0);

const CompleteDialog = ({ pickup, isAdmin, onClose, onSubmit }) => {
  const [otp, setOtp] = useState("");
  const [cash, setCash] = useState(false);
  const needCash = pickup.payment_method === "cod" && pickup.payment_status === "pending";
  const submit = (e) => {
    e.preventDefault();
    onSubmit({ otp, cash_collected: cash });
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:max-w-md" data-testid="complete-dialog">
        <DialogHeader><DialogTitle>Complete {pickup.id}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">{isAdmin ? "Admins can complete without OTP (override is logged)." : "Ask the customer for their 4-digit pickup OTP."}</p>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input data-testid="complete-otp-input" inputMode="numeric" maxLength={4} required={!isAdmin} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="0000" className={`${inputCls} pl-9 font-mono text-lg font-bold tracking-[0.5em]`} />
          </div>
          {needCash && (
            <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Checkbox data-testid="cash-collected-checkbox" checked={cash} onCheckedChange={(v) => setCash(!!v)} /> I collected the {inr(pickup.service_fee)} cash service fee
            </label>
          )}
          <button type="submit" className={`${btnPrimary} w-full`} data-testid="complete-submit-btn"><CheckCircle2 className="h-4 w-4" /> Mark Completed</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function RealPickupsList({ mode = "all" }) {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const isDelivery = user.role === "delivery_partner";
  const verified = isDelivery && user.kyc?.status === "verified";
  const [status, setStatus] = useState("All");
  const [district, setDistrict] = useState("All");
  const [tracking, setTracking] = useState(null);
  const [partners, setPartners] = useState([]);
  const [completing, setCompleting] = useState(null);
  useEffect(() => {
    if (isAdmin) api.get("/admin/delivery-partners").then((r) => setPartners(r.data));
  }, [isAdmin]);
  const { data, loading, refresh, setData, lastSync } = usePolling(() =>
    api.get("/scrap/pickups/all", { params: { role: user.role, email: undefined, assigned: mode === "assigned" ? "me" : undefined } }).then((r) => r.data)
  );

  const update = async (id, next, extra = {}) => {
    if (next === "Completed" && !extra.confirmed) return setCompleting(data.find((r) => r.id === id));
    try {
      const { data: updated } = await api.put(`/scrap/pickups/${id}/status`, { status: next, otp: extra.otp, cash_collected: extra.cash_collected });
      setData((rows) => rows.map((r) => (r.id === id ? updated : r)));
      setCompleting(null);
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
      <UiSelect testId={`status-select-${p.id}`} value={p.status} onChange={(v) => update(p.id, v)} className="h-9 w-[150px] text-xs"
        options={(isAdmin ? STATUSES : DELIVERY_OPTIONS[p.status] || [p.status]).map((s) => ({ value: s, label: s === "Pending" && !isAdmin ? "Release to pool" : s }))} />
    ) : <StatusBadge status={p.status} testId={`pickup-status-${p.id}`} /> },
    { label: "Date", render: (p) => <span className="text-slate-500">{fmtDate(p.created_at)}</span> },
  ];
  if (isAdmin) columns.push({ label: "Assign Partner", render: (p) => FINAL.includes(p.status) ? <span className="text-xs text-slate-500">{p.assigned_name || "—"}</span> : (
    <UiSelect testId={`assign-select-${p.id}`} value={p.assigned_to || ""} onChange={(v) => assign(p.id, v)} className="h-9 w-[180px] text-xs"
      placeholder={partners.length ? "Select partner" : "No verified partners"} options={partners.map((d) => ({ value: d.email, label: `${d.name} · ${d.vehicle_number}` }))} />) });
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
            <UiSelect testId="pickups-status-filter" value={status} onChange={setStatus} options={["All", ...STATUSES]} className="w-[140px]" />
            <UiSelect testId="pickups-district-filter" value={district} onChange={setDistrict} options={["All", ...districts]} className="w-[150px]" />
          </>
        } />
      {tracking && <PickupTimeline pickupId={tracking} onClose={() => setTracking(null)} />}
      {completing && <CompleteDialog pickup={completing} isAdmin={isAdmin} onClose={() => setCompleting(null)} onSubmit={(x) => update(completing.id, "Completed", { ...x, confirmed: true })} />}
    </div>
  );
}
