import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { fmtDate, inputCls, btnPrimary } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { UiSelect } from "@/components/reloop/Fields";
import { PageHeader, LoadingBlock, MetricCard, StatusBadge } from "@/components/reloop/Primitives";
import { DataTable } from "@/components/reloop/DataTable";
import { AuthImage } from "@/components/reloop/Files";

export const KYC_LABELS = { not_submitted: "Not Submitted", pending: "Under Review", verified: "Verified", rejected: "Rejected" };
const DOCS = [["license_file_id", "Driving Licence"], ["photo_file_id", "Photo"], ["selfie_file_id", "Selfie"]];

const ReviewDialog = ({ partner, onClose, onDone }) => {
  const [reason, setReason] = useState("");
  const k = partner.kyc;
  const act = async (action) => {
    try {
      await api.put(`/admin/kyc/${partner.id}`, { action, reason });
      toast.success(action === "approve" ? `${partner.name} verified` : `${partner.name} rejected`);
      onDone();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl" data-testid="kyc-review-dialog">
        <DialogHeader><DialogTitle>Review {partner.name}</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[["Email", partner.email], ["District", k.district], ["Mobile", k.phone], ["Vehicle", `${k.vehicle_type} · ${k.vehicle_number}`], ["Licence No.", k.license_number], ["Submitted", fmtDate(k.submitted_at)]].map(([a, b]) => (
            <div key={a}><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{a}</dt><dd className="break-words font-mono text-xs font-bold text-slate-800">{b}</dd></div>
          ))}
        </dl>
        <div className="grid grid-cols-3 gap-3">
          {DOCS.map(([key, label]) => (
            <div key={key}><p className="mb-1 text-xs font-semibold text-slate-600">{label}</p>
              <AuthImage file={{ id: k[key] }} className="aspect-square w-full" testId={`kyc-doc-${key}`} /></div>
          ))}
        </div>
        <Input data-testid="kyc-reject-reason-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required for rejection)" className={inputCls} />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" data-testid="kyc-reject-btn" onClick={() => act("reject")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 text-sm font-semibold text-rose-600 hover:bg-rose-50"><XCircle className="h-4 w-4" /> Reject</button>
          <button type="button" data-testid="kyc-approve-btn" onClick={() => act("approve")} className={`${btnPrimary} h-11`}><CheckCircle2 className="h-4 w-4" /> Approve</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const EXPORT = [
  { label: "Name", key: "name" }, { label: "Email", key: "email" }, { label: "District", key: "district" },
  { label: "Status", value: (r) => KYC_LABELS[r.kyc.status] }, { label: "Vehicle", value: (r) => r.kyc.vehicle_number || "" },
  { label: "Licence", value: (r) => r.kyc.license_number || "" }, { label: "Submitted", value: (r) => r.kyc.submitted_at || "" },
];

export default function KycReviewView() {
  const [status, setStatus] = useState("all");
  const [reviewing, setReviewing] = useState(null);
  const { data, loading, refresh } = usePolling(() => api.get("/admin/kyc").then((r) => r.data.map((p) => ({ ...p, submitted_at: p.kyc.submitted_at, vehicle: p.kyc.vehicle_number }))));
  if (loading && !data) return <LoadingBlock />;
  const count = (s) => data.filter((p) => p.kyc.status === s).length;
  const rows = data.filter((p) => status === "all" || p.kyc.status === status);
  const columns = [
    { label: "Partner", render: (p) => <div><p className="font-semibold text-slate-900">{p.name}</p><p className="text-xs text-slate-500">{p.email}</p></div> },
    { label: "District", key: "district" },
    { label: "Vehicle", render: (p) => <span className="font-mono font-bold">{p.kyc.vehicle_number || "—"}</span> },
    { label: "Licence", render: (p) => <span className="font-mono text-xs">{p.kyc.license_number || "—"}</span> },
    { label: "Status", render: (p) => <StatusBadge status={KYC_LABELS[p.kyc.status]} testId={`kyc-status-${p.email}`} /> },
    { label: "Submitted", render: (p) => <span className="text-slate-500">{fmtDate(p.kyc.submitted_at)}</span> },
    { label: "Action", render: (p) => p.kyc.status === "not_submitted" ? <span className="text-xs text-slate-400">Awaiting documents</span> : (
      <button type="button" data-testid={`kyc-review-btn-${p.email}`} onClick={() => setReviewing(p)} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Review</button>) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Partner Verification" subtitle="Verify delivery partners' licence, photo, selfie and vehicle before they can take pickups." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Under Review" value={count("pending")} format="number" testId="kyc-metric-pending" />
        <MetricCard label="Verified" value={count("verified")} format="number" index={1} testId="kyc-metric-verified" />
        <MetricCard label="Rejected" value={count("rejected")} format="number" index={2} testId="kyc-metric-rejected" />
        <MetricCard label="Not Submitted" value={count("not_submitted")} format="number" index={3} testId="kyc-metric-not-submitted" />
      </div>
      <DataTable testId="kyc-table" title={`${rows.length} delivery partners`} columns={columns} rows={rows} dateKey="submitted_at"
        searchKeys={["name", "email", "district", "vehicle"]} exportName="partner-verification" exportColumns={EXPORT}
        filters={<UiSelect testId="kyc-status-filter" value={status} onChange={setStatus} className="w-[160px]"
          options={[{ value: "all", label: "All statuses" }, ...Object.entries(KYC_LABELS).map(([value, label]) => ({ value, label }))]} />} />
      {reviewing && <ReviewDialog partner={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); refresh(); }} />}
    </div>
  );
}
