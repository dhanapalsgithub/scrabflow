import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Clock, Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { inputCls, btnPrimary, fmtDate } from "@/lib/format";
import { Panel, PageHeader, LoadingBlock } from "@/components/reloop/Primitives";
import { FileField } from "@/components/reloop/Files";
import { Input } from "@/components/ui/input";
import { UiSelect } from "@/components/reloop/Fields";

const VEHICLES = ["Bike", "Auto", "Van", "Mini Truck", "Truck"];
const BANNERS = {
  not_submitted: { icon: ShieldAlert, cls: "border-amber-200 bg-amber-50 text-amber-800", title: "Verification required", text: "Upload your driving licence, photo and a selfie with vehicle details. You can take pickups once your district admin approves." },
  pending: { icon: Clock, cls: "border-blue-200 bg-blue-50 text-blue-800", title: "Under review", text: "Your documents were submitted. Your district admin will verify them shortly." },
  verified: { icon: ShieldCheck, cls: "border-emerald-200 bg-emerald-50 text-emerald-800", title: "Verified partner", text: "You are verified and can accept and complete pickups." },
  rejected: { icon: ShieldAlert, cls: "border-rose-200 bg-rose-50 text-rose-800", title: "Verification rejected", text: "Please fix the issue below and submit again." },
};

const Label = ({ children }) => <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</label>;

export const KycBanner = ({ kyc }) => {
  const b = BANNERS[kyc?.status || "not_submitted"];
  const Icon = b.icon;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${b.cls}`} data-testid="kyc-status-banner" data-status={kyc?.status || "not_submitted"}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div><p className="text-sm font-bold">{b.title}</p><p className="text-sm">{b.text}</p>
        {kyc?.reject_reason && <p className="mt-1 text-sm font-semibold" data-testid="kyc-reject-reason">Reason: {kyc.reject_reason}</p>}
        {kyc?.reviewed_at && <p className="mt-1 text-xs opacity-80">Reviewed {fmtDate(kyc.reviewed_at)}</p>}</div>
    </div>
  );
};

const KycForm = ({ kyc, districts, onSaved }) => {
  const { user } = useAuth();
  const [form, setForm] = useState({ district: kyc.district || user.district || "", phone: kyc.phone || user.phone || "", vehicle_type: kyc.vehicle_type || "Bike", vehicle_number: kyc.vehicle_number || "", license_number: kyc.license_number || "" });
  const [files, setFiles] = useState({ license: null, photo: null, selfie: null });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setFile = (k) => (v) => setFiles({ ...files, [k]: v });

  const submit = async (e) => {
    e.preventDefault();
    if (!files.license || !files.photo || !files.selfie) return toast.error("Please upload licence, photo and selfie");
    if (!form.district) return toast.error("Select your operating district");
    setBusy(true);
    try {
      const { data } = await api.put("/kyc/me", { ...form, license_file_id: files.license.id, photo_file_id: files.photo.id, selfie_file_id: files.selfie.id });
      toast.success("Documents submitted for verification");
      onSaved(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2" data-testid="kyc-form">
      <Panel title="Vehicle & Licence Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Operating District</Label>
            <UiSelect testId="kyc-district-select" value={form.district} onChange={(v) => setForm({ ...form, district: v })} options={districts} placeholder="Select district" /></div>
          <div><Label>Mobile Number</Label><Input data-testid="kyc-phone-input" required minLength={8} value={form.phone} onChange={set("phone")} placeholder="+91" className={inputCls} /></div>
          <div><Label>Vehicle Type</Label>
            <UiSelect testId="kyc-vehicle-type-select" value={form.vehicle_type} onChange={(v) => setForm({ ...form, vehicle_type: v })} options={VEHICLES} /></div>
          <div><Label>Vehicle Number</Label><Input data-testid="kyc-vehicle-number-input" required minLength={4} value={form.vehicle_number} onChange={set("vehicle_number")} placeholder="TN 01 AB 1234" className={`${inputCls} font-mono uppercase`} /></div>
          <div className="sm:col-span-2"><Label>Driving Licence Number</Label><Input data-testid="kyc-license-number-input" required minLength={5} value={form.license_number} onChange={set("license_number")} placeholder="TN01 20200012345" className={`${inputCls} font-mono uppercase`} /></div>
        </div>
      </Panel>
      <Panel title="Documents" subtitle="JPG, PNG, WEBP or PDF · max 5 MB">
        <div className="space-y-3">
          <FileField category="license" label="Driving Licence" hint="Front side, all text readable" value={files.license} onChange={setFile("license")} testId="kyc-license" />
          <FileField category="photo" label="Passport-size Photo" hint="Clear face photo" value={files.photo} onChange={setFile("photo")} testId="kyc-photo" />
          <FileField category="selfie" label="Live Selfie" hint="Take a selfie now using your camera" value={files.selfie} onChange={setFile("selfie")} capture="user" testId="kyc-selfie" />
          <button type="submit" disabled={busy} className={`${btnPrimary} h-11 w-full`} data-testid="kyc-submit-btn">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit for Verification
          </button>
        </div>
      </Panel>
    </form>
  );
};

const KycDetails = ({ kyc }) => (
  <Panel title="Submitted Details" testId="kyc-details">
    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {[["District", kyc.district], ["Mobile", kyc.phone], ["Vehicle", `${kyc.vehicle_type} · ${kyc.vehicle_number}`], ["Licence No.", kyc.license_number], ["Submitted", fmtDate(kyc.submitted_at)]].map(([k, v]) => (
        <div key={k}><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k}</dt><dd className="mt-1 font-mono font-bold text-slate-800">{v}</dd></div>
      ))}
    </dl>
  </Panel>
);

export default function VerificationView() {
  const { updateUser } = useAuth();
  const [kyc, setKyc] = useState(null);
  const [districts, setDistricts] = useState([]);
  useEffect(() => {
    api.get("/kyc/me").then((r) => { setKyc(r.data); updateUser({ kyc: r.data }); });
    api.get("/settings").then((r) => setDistricts(r.data.service_districts));
  }, [updateUser]);
  if (!kyc) return <LoadingBlock />;
  const saved = (k) => { setKyc(k); updateUser({ kyc: k }); };
  const canEdit = ["not_submitted", "rejected"].includes(kyc.status);

  return (
    <div className="space-y-6">
      <PageHeader title="Partner Verification" subtitle="Your district admin verifies every delivery partner before they can take pickups." />
      <KycBanner kyc={kyc} />
      {canEdit ? <KycForm kyc={kyc} districts={districts} onSaved={saved} /> : <KycDetails kyc={kyc} />}
    </div>
  );
}
