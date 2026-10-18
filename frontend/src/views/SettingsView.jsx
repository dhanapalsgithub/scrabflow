import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiError } from "@/lib/api";
import { inputCls, btnPrimary, btnGhost, slug, fmtDate } from "@/lib/format";
import { Panel, PageHeader, LoadingBlock } from "@/components/reloop/Primitives";
import { UiSelect } from "@/components/reloop/Fields";

const Label = ({ children }) => <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</label>;

export default function SettingsView() {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newType, setNewType] = useState({ name: "", rate: "" });

  useEffect(() => {
    api.get("/settings").then((r) => setForm({ ...r.data, districts: r.data.service_districts.join(", ") }));
  }, []);

  if (!form) return <LoadingBlock />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setRate = (m) => (e) => setForm({ ...form, rates: { ...form.rates, [m]: e.target.value } });
  const removeType = (m) => setForm({ ...form, rates: Object.fromEntries(Object.entries(form.rates).filter(([k]) => k !== m)) });
  const addType = () => {
    const name = newType.name.trim();
    if (name.length < 2 || form.rates[name] !== undefined) return toast.error("Enter a new, unique scrap type name");
    setForm({ ...form, rates: { ...form.rates, [name]: newType.rate || 0 } });
    setNewType({ name: "", rate: "" });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/settings", {
        rates: Object.fromEntries(Object.keys(form.rates).map((m) => [m, parseFloat(form.rates[m]) || 0])),
        service_fee: parseFloat(form.service_fee) || 0,
        platform_name: form.platform_name,
        support_email: form.support_email,
        min_pickup_kg: parseFloat(form.min_pickup_kg) || 0,
        service_districts: form.districts.split(","),
        dispatch_mode: form.dispatch_mode,
      });
      setForm({ ...data, districts: data.service_districts.join(", ") });
      toast.success("Global settings saved");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} data-testid="settings-form">
      <PageHeader title="Global Settings" subtitle={`Platform-wide configuration. Last updated ${fmtDate(form.updated_at)}${form.updated_by ? ` by ${form.updated_by}` : ""}.`}>
        <button type="submit" disabled={busy} className={btnPrimary} data-testid="save-settings-btn"><Save className="h-4 w-4" /> Save Settings</button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Scrap Types & Rates" subtitle="INR per kg — new types appear for every user immediately after saving">
          <div className="space-y-3">
            {Object.keys(form.rates).map((m) => (
              <div key={m} className="flex items-center justify-between gap-3">
                <span className="flex-1 text-sm font-semibold text-slate-800">{m}</span>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                  <Input data-testid={`rate-input-${slug(m)}`} type="number" min="0" step="0.5" value={form.rates[m]} onChange={setRate(m)} className={`${inputCls} pl-7 font-mono font-bold`} />
                </div>
                <button type="button" aria-label={`Remove ${m}`} data-testid={`remove-type-${slug(m)}`} onClick={() => removeType(m)} className={`${btnGhost} h-10 px-2.5 text-rose-600`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Input data-testid="new-type-name-input" value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} placeholder="New scrap type e.g. Glass" className={`${inputCls} min-w-[160px] flex-1`} />
              <Input data-testid="new-type-rate-input" type="number" min="0" step="0.5" value={newType.rate} onChange={(e) => setNewType({ ...newType, rate: e.target.value })} placeholder="₹/kg" className={`${inputCls} w-24 font-mono`} />
              <button type="button" onClick={addType} data-testid="add-type-btn" className={btnGhost}><Plus className="h-4 w-4" /> Add</button>
            </div>
          </div>
        </Panel>
        <Panel title="Platform" subtitle="General operations configuration">
          <div className="space-y-4">
            <div><Label>Platform Name</Label><Input data-testid="platform-name-input" value={form.platform_name} onChange={set("platform_name")} className={inputCls} /></div>
            <div><Label>Support Email</Label><Input data-testid="support-email-input" type="email" value={form.support_email} onChange={set("support_email")} className={inputCls} /></div>
            <div><Label>Minimum Pickup Weight (kg)</Label><Input data-testid="min-pickup-input" type="number" min="0" value={form.min_pickup_kg} onChange={set("min_pickup_kg")} className={`${inputCls} font-mono`} /></div>
            <div><Label>Pickup Service Fee (₹, paid by customer — 0 to disable)</Label><Input data-testid="service-fee-input" type="number" min="0" value={form.service_fee ?? 0} onChange={set("service_fee")} className={`${inputCls} font-mono`} /></div>
            <div><Label>Dispatch Mode</Label>
              <UiSelect testId="dispatch-mode-select" value={form.dispatch_mode || "open"} onChange={(v) => setForm({ ...form, dispatch_mode: v })}
                options={[{ value: "open", label: "Open — any verified delivery partner can accept" }, { value: "admin_assign", label: "Admin-assign — only admins assign orders" }]} /></div>
            <div><Label>Service Districts (comma separated)</Label><Textarea data-testid="districts-input" rows={3} value={form.districts} onChange={set("districts")} className={`${inputCls} h-auto py-2.5`} /></div>
          </div>
        </Panel>
      </div>
    </form>
  );
}
