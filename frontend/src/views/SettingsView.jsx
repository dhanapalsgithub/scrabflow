import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { inputCls, btnPrimary, MATERIALS, slug, fmtDate } from "@/lib/format";
import { Panel, PageHeader, LoadingBlock } from "@/components/reloop/Primitives";

const Label = ({ children }) => <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</label>;

export default function SettingsView() {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setForm({ ...r.data, districts: r.data.service_districts.join(", ") }));
  }, []);

  if (!form) return <LoadingBlock />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setRate = (m) => (e) => setForm({ ...form, rates: { ...form.rates, [m]: e.target.value } });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.put("/settings", {
        rates: Object.fromEntries(MATERIALS.map((m) => [m, parseFloat(form.rates[m]) || 0])),
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
        <Panel title="Scrap Price Rates" subtitle="INR per kg — applied to all new pickups">
          <div className="space-y-4">
            {MATERIALS.map((m) => (
              <div key={m} className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-slate-800">{m}</span>
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                  <input data-testid={`rate-input-${slug(m)}`} type="number" min="0" step="0.5" value={form.rates[m]} onChange={setRate(m)} className={`${inputCls} pl-7 font-mono font-bold`} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Platform" subtitle="General operations configuration">
          <div className="space-y-4">
            <div><Label>Platform Name</Label><input data-testid="platform-name-input" value={form.platform_name} onChange={set("platform_name")} className={inputCls} /></div>
            <div><Label>Support Email</Label><input data-testid="support-email-input" type="email" value={form.support_email} onChange={set("support_email")} className={inputCls} /></div>
            <div><Label>Minimum Pickup Weight (kg)</Label><input data-testid="min-pickup-input" type="number" min="0" value={form.min_pickup_kg} onChange={set("min_pickup_kg")} className={`${inputCls} font-mono`} /></div>
            <div><Label>Dispatch Mode</Label>
              <select data-testid="dispatch-mode-select" value={form.dispatch_mode || "open"} onChange={set("dispatch_mode")} className={inputCls}>
                <option value="open">Open — any verified delivery partner can accept</option>
                <option value="admin_assign">Admin-assign — only admins assign orders</option>
              </select></div>
            <div><Label>Service Districts (comma separated)</Label><textarea data-testid="districts-input" rows={3} value={form.districts} onChange={set("districts")} className={`${inputCls} h-auto py-2.5`} /></div>
          </div>
        </Panel>
      </div>
    </form>
  );
}
