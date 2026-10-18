import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Package, Cpu, Wrench, Loader2, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { inr, kg, inputCls, btnPrimary, slug, MATERIALS } from "@/lib/format";
import { Panel, PageHeader, LoadingBlock } from "@/components/reloop/Primitives";
import { PhotoPicker } from "@/components/reloop/Files";

const ICONS = { "Mixed Paper": FileText, Plastics: Package, "E-Waste": Cpu, Metals: Wrench };
const Label = ({ children }) => <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</label>;

export default function SellScrapForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [form, setForm] = useState({ material: "Mixed Paper", weight: "", unit: "Kg", district: user.district || "", address: user.address || "", phone: user.phone || "", preferred_date: "", notes: "" });

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data));
  }, []);

  if (!settings) return <LoadingBlock />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const rate = settings.rates[form.material] || 0;
  const weightKg = (parseFloat(form.weight) || 0) * (form.unit === "Tons" ? 1000 : 1);
  const earnings = weightKg * rate;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/scrap/pickups/create", { ...form, weight: parseFloat(form.weight), photo_ids: photos.map((p) => p.id) });
      toast.success(`Pickup ${data.id} requested`, { description: `Estimated earnings ${inr(data.amount)}` });
      setForm({ ...form, weight: "", notes: "", preferred_date: "" });
      navigate("/dashboard/my-pickups");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Sell Your Scrap" subtitle="Schedule a doorstep pickup. Earnings are calculated instantly from live rates." />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3" data-testid="sell-scrap-form">
        <Panel title="Pickup Details" className="lg:col-span-2">
          <Label>Material Type</Label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {MATERIALS.map((m) => {
              const Icon = ICONS[m];
              const active = form.material === m;
              return (
                <button type="button" key={m} onClick={() => setForm({ ...form, material: m })} data-testid={`material-option-${slug(m)}`}
                  className={`rounded-xl border p-4 text-left transition-colors ${active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <Icon className={`h-5 w-5 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                  <p className="mt-3 text-sm font-semibold text-slate-900">{m}</p>
                  <p className="font-mono text-xs text-slate-500">{inr(settings.rates[m])}/kg</p>
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Weight</Label>
              <div className="flex gap-2">
                <input data-testid="weight-input" type="number" min="0.01" step="0.01" required value={form.weight} onChange={set("weight")} placeholder="0.00" className={`${inputCls} font-mono font-bold`} />
                <div className="flex shrink-0 rounded-xl border border-slate-200 p-1">
                  {["Kg", "Tons"].map((u) => (
                    <button type="button" key={u} data-testid={`unit-${u.toLowerCase()}-btn`} onClick={() => setForm({ ...form, unit: u })}
                      className={`rounded-lg px-3 text-sm font-semibold transition-colors ${form.unit === u ? "bg-slate-950 text-white" : "text-slate-500"}`}>{u}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label>District</Label>
              <select data-testid="district-select" required value={form.district} onChange={set("district")} className={inputCls}>
                <option value="">Select district</option>
                {settings.service_districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label>Pickup Address</Label>
              <textarea data-testid="address-input" required minLength={3} rows={3} value={form.address} onChange={set("address")} placeholder="Door no, street, area, landmark"
                className={`${inputCls} h-auto py-2.5`} />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <input data-testid="phone-input" value={form.phone} onChange={set("phone")} placeholder="+91" className={inputCls} />
            </div>
            <div>
              <Label>Preferred Date</Label>
              <input data-testid="preferred-date-input" type="date" value={form.preferred_date} onChange={set("preferred_date")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <Label>Scrap Photos</Label>
              <PhotoPicker value={photos} onChange={setPhotos} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes (optional)</Label>
              <input data-testid="notes-input" value={form.notes} onChange={set("notes")} placeholder="Gate code, bag count, etc." className={inputCls} />
            </div>
          </div>
        </Panel>

        <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm" data-testid="earnings-panel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estimated Earnings</p>
            <p className="mt-3 font-mono text-4xl font-extrabold text-emerald-400" data-testid="estimated-earnings">{inr(earnings)}</p>
            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Material</dt><dd className="font-semibold">{form.material}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Rate</dt><dd className="font-mono font-bold">{inr(rate)}/kg</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Weight</dt><dd className="font-mono font-bold" data-testid="weight-kg-display">{kg(weightKg)}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">Minimum pickup: {settings.min_pickup_kg} kg</p>
          </div>
          <button data-testid="submit-pickup-btn" type="submit" disabled={busy} className={`${btnPrimary} h-12 w-full`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Request Pickup
          </button>
        </div>
      </form>
    </div>
  );
}
