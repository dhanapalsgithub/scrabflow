import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Package, Cpu, Wrench, Recycle, Loader2, CheckCircle2, Trash2, Plus, Banknote, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { inr, kg, inputCls, btnPrimary, slug } from "@/lib/format";
import { payOnline } from "@/lib/razorpay";
import { Panel, PageHeader, LoadingBlock } from "@/components/reloop/Primitives";
import { PhotoPicker } from "@/components/reloop/Files";
import { UiSelect, DatePicker } from "@/components/reloop/Fields";

const ICONS = { "Mixed Paper": FileText, Plastics: Package, "E-Waste": Cpu, Metals: Wrench };
const Label = ({ children }) => <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</label>;
const toKg = (it) => (parseFloat(it.weight) || 0) * (it.unit === "Tons" ? 1000 : 1);

const ItemRow = ({ item, rate, onChange, onRemove }) => (
  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`item-row-${slug(item.material)}`}>
    <p className="min-w-[110px] flex-1 text-sm font-semibold text-slate-900">{item.material}<span className="block font-mono text-xs font-normal text-slate-500">{inr(rate)}/kg</span></p>
    <Input data-testid={`item-weight-${slug(item.material)}`} type="number" min="0.01" step="0.01" required value={item.weight} onChange={(e) => onChange({ ...item, weight: e.target.value })} placeholder="0.00" className={`${inputCls} w-28 font-mono font-bold`} />
    <div className="flex rounded-xl border border-slate-200 p-1">
      {["Kg", "Tons"].map((u) => (
        <button type="button" key={u} data-testid={`item-unit-${slug(item.material)}-${u.toLowerCase()}`} onClick={() => onChange({ ...item, unit: u })}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${item.unit === u ? "bg-slate-950 text-white" : "text-slate-500"}`}>{u}</button>
      ))}
    </div>
    <span className="w-24 text-right font-mono text-sm font-bold text-emerald-700">{inr(toKg(item) * rate)}</span>
    <button type="button" aria-label="Remove" data-testid={`item-remove-${slug(item.material)}`} onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
  </div>
);

const PayOption = ({ id, icon: Icon, title, text, active, disabled, onClick }) => (
  <button type="button" disabled={disabled} onClick={onClick} data-testid={`payment-option-${id}`}
    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
    <Icon className={`mt-0.5 h-5 w-5 ${active ? "text-emerald-600" : "text-slate-400"}`} />
    <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="text-xs text-slate-500">{text}</span></span>
  </button>
);

export default function SellScrapForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [payCfg, setPayCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ payment_method: "cod", district: user.district || "", address: user.address || "", phone: user.phone || "", preferred_date: "", notes: "" });

  useEffect(() => {
    api.get("/settings").then((r) => { setSettings(r.data); setItems([{ material: Object.keys(r.data.rates)[0], weight: "", unit: "Kg" }]); });
    api.get("/payments/config").then((r) => setPayCfg(r.data));
  }, []);

  if (!settings || !payCfg) return <LoadingBlock />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const materials = Object.keys(settings.rates);
  const toggle = (m) => setItems(items.some((i) => i.material === m) ? items.filter((i) => i.material !== m) : [...items, { material: m, weight: "", unit: "Kg" }]);
  const totalKg = items.reduce((a, i) => a + toKg(i), 0);
  const earnings = items.reduce((a, i) => a + toKg(i) * (settings.rates[i.material] || 0), 0);
  const fee = payCfg.service_fee || 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!items.length) return toast.error("Select at least one scrap type");
    setBusy(true);
    try {
      const body = { ...form, items: items.map((i) => ({ ...i, weight: parseFloat(i.weight) })), photo_ids: photos.map((p) => p.id) };
      const { data } = await api.post("/scrap/pickups/create", body);
      toast.success(`Pickup ${data.id} requested`, { description: `Estimated earnings ${inr(data.amount)} · OTP ${data.otp}` });
      if (data.payment_method === "online" && data.payment_status === "pending") await payOnline(data.id);
      navigate("/dashboard/my-pickups");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Sell Your Scrap" subtitle="Add one or more scrap types in a single pickup. Earnings are calculated instantly from live rates." />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3" data-testid="sell-scrap-form">
        <Panel title="Pickup Details" className="lg:col-span-2">
          <Label>Scrap Types (select one or more)</Label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {materials.map((m) => {
              const Icon = ICONS[m] || Recycle;
              const active = items.some((i) => i.material === m);
              return (
                <button type="button" key={m} onClick={() => toggle(m)} data-testid={`material-option-${slug(m)}`} data-active={active}
                  className={`relative rounded-xl border p-4 text-left transition-colors ${active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  {active ? <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-emerald-600" /> : <Plus className="absolute right-3 top-3 h-4 w-4 text-slate-300" />}
                  <Icon className={`h-5 w-5 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                  <p className="mt-3 text-sm font-semibold text-slate-900">{m}</p>
                  <p className="font-mono text-xs text-slate-500">{inr(settings.rates[m])}/kg</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2" data-testid="pickup-items">
            {items.map((it, idx) => (
              <ItemRow key={it.material} item={it} rate={settings.rates[it.material] || 0}
                onChange={(v) => setItems(items.map((x, i) => (i === idx ? v : x)))} onRemove={() => setItems(items.filter((_, i) => i !== idx))} />
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>District</Label>
              <UiSelect testId="district-select" value={form.district} onChange={(v) => setForm({ ...form, district: v })} options={settings.service_districts} placeholder="Select district" />
            </div>
            <div>
              <Label>Preferred Date</Label>
              <DatePicker testId="preferred-date-input" value={form.preferred_date} onChange={(v) => setForm({ ...form, preferred_date: v })} fromDate={new Date()} />
            </div>
            <div className="sm:col-span-2">
              <Label>Pickup Address</Label>
              <Textarea data-testid="address-input" required minLength={3} rows={3} value={form.address} onChange={set("address")} placeholder="Door no, street, area, landmark" className="rounded-xl border-slate-200" />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input data-testid="phone-input" value={form.phone} onChange={set("phone")} placeholder="+91" className={inputCls} />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input data-testid="notes-input" value={form.notes} onChange={set("notes")} placeholder="Gate code, bag count, etc." className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <Label>Scrap Photos</Label>
              <PhotoPicker value={photos} onChange={setPhotos} />
            </div>
            {fee > 0 && (
              <div className="sm:col-span-2">
                <Label>Pickup Service Fee · {inr(fee)}</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PayOption id="cod" icon={Banknote} title="Cash on Delivery" text="Pay the fee in cash to the partner at pickup" active={form.payment_method === "cod"} onClick={() => setForm({ ...form, payment_method: "cod" })} />
                  <PayOption id="online" icon={CreditCard} title="Pay Online (Razorpay)" text={payCfg.online_enabled ? "UPI, cards, netbanking" : "Coming soon — not configured yet"}
                    disabled={!payCfg.online_enabled} active={form.payment_method === "online"} onClick={() => setForm({ ...form, payment_method: "online" })} />
                </div>
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm" data-testid="earnings-panel">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estimated Earnings</p>
            <p className="mt-3 font-mono text-4xl font-extrabold text-emerald-400" data-testid="estimated-earnings">{inr(earnings)}</p>
            <dl className="mt-6 space-y-2 text-sm">
              {items.map((i) => (
                <div key={i.material} className="flex justify-between"><dt className="text-slate-400">{i.material}</dt><dd className="font-mono font-bold">{kg(toKg(i))}</dd></div>
              ))}
              <div className="flex justify-between border-t border-slate-800 pt-2"><dt className="text-slate-400">Total weight</dt><dd className="font-mono font-bold" data-testid="weight-kg-display">{kg(totalKg)}</dd></div>
              {fee > 0 && <div className="flex justify-between"><dt className="text-slate-400">Service fee</dt><dd className="font-mono font-bold" data-testid="service-fee-display">{inr(fee)}</dd></div>}
            </dl>
            <p className="mt-4 text-xs text-slate-500">Minimum pickup: {settings.min_pickup_kg} kg</p>
          </div>
          <button data-testid="submit-pickup-btn" type="submit" disabled={busy || !items.length || !form.district} className={`${btnPrimary} h-12 w-full`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Request Pickup
          </button>
        </div>
      </form>
    </div>
  );
}

