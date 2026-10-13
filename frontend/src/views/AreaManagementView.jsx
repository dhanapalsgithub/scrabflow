import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { kg, TH, TD, TR, inputCls, btnPrimary, btnGhost, slug } from "@/lib/format";
import { Panel, PageHeader, StatusBadge, LoadingBlock, EmptyRow, OrderId, ExportButton, MetricCard } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";

const EMPTY = { zone_id: "", city: "Chennai", assigned_hub: "", households: 0, daily_volume_kg: 0, status: "Active" };
const COLS = [
  { label: "Zone ID", key: "zone_id" }, { label: "City/District", key: "city" }, { label: "Assigned Hub", key: "assigned_hub" },
  { label: "Households", key: "households" }, { label: "Daily Volume (kg)", key: "daily_volume_kg" }, { label: "Pickups Mapped", key: "pickups_mapped" }, { label: "Status", key: "status" },
];

const ZoneDialog = ({ zone, onClose, onSaved }) => {
  const [form, setForm] = useState(zone?.zone_id ? zone : EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, households: parseInt(form.households, 10) || 0, daily_volume_kg: parseFloat(form.daily_volume_kg) || 0 };
      if (zone?.zone_id) await api.put(`/zones/${encodeURIComponent(zone.zone_id)}`, body);
      else await api.post("/zones", body);
      toast.success(`Zone ${body.zone_id} saved`);
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };
  const field = (k, label, type = "text") => (
    <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      <input data-testid={`zone-${slug(k)}-input`} required type={type} value={form[k]} onChange={set(k)} className={inputCls} /></div>
  );
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="rounded-2xl sm:max-w-lg" data-testid="zone-dialog">
        <DialogHeader><DialogTitle>{zone?.zone_id ? "Edit Zone" : "Add Zone"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {field("zone_id", "Zone ID")}
          {field("city", "City / District")}
          {field("assigned_hub", "Assigned Hub")}
          {field("households", "Households", "number")}
          {field("daily_volume_kg", "Daily Volume (kg)", "number")}
          <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Status</label>
            <select data-testid="zone-status-select" value={form.status} onChange={set("status")} className={inputCls}>
              {["Active", "Maintenance", "Inactive"].map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <button data-testid="zone-save-btn" type="submit" disabled={busy} className={`${btnPrimary} sm:col-span-2`}>Save Zone</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function AreaManagementView() {
  const { user } = useAuth();
  const canEdit = ["partner", "admin"].includes(user.role);
  const [editing, setEditing] = useState(null);
  const { data, loading, refresh, lastSync } = usePolling(() => api.get("/zones").then((r) => r.data));

  const remove = async (z) => {
    if (!window.confirm(`Delete ${z.zone_id}?`)) return;
    try {
      await api.delete(`/zones/${encodeURIComponent(z.zone_id)}`);
      toast.success(`Zone ${z.zone_id} deleted`);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (loading && !data) return <LoadingBlock />;
  const { zones, metrics: m } = data;
  const cards = [
    { key: "zones", label: "Active Zones", value: m.active_zones, format: "number", hint: `${zones.length} zones total` },
    { key: "mapped", label: "Total Pickups Mapped", value: m.total_pickups_mapped, format: "number", hint: "Within zone cities" },
    { key: "volume", label: "Total Volume (Kg)", value: m.total_volume_kg, format: "kg", hint: "Excluding cancelled" },
    { key: "hub", label: "Hub Status", value: m.hub_status, format: "text", hint: "Live network health" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Partner Hub & Area Management" subtitle="Zones, hubs and route coverage across Tamil Nadu.">
        <LiveSync lastSync={lastSync} onRefresh={refresh} />
        <ExportButton filename="area-routes" columns={COLS} rows={zones} />
        {canEdit && <button type="button" className={btnPrimary} onClick={() => setEditing({})} data-testid="add-zone-btn"><Plus className="h-4 w-4" /> Add Zone</button>}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => <MetricCard key={c.key} {...c} index={i} testId={`area-metric-${c.key}`} />)}
      </div>
      <Panel title="Area & Routes" subtitle="Zone-level hub assignments" bodyClass="p-0" testId="zones-table">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/80"><tr>{["Zone ID", "City/District", "Assigned Hub", "Households", "Daily Volume", "Pickups", "Status", canEdit ? "Actions" : null].filter(Boolean).map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {zones.length === 0 && <EmptyRow cols={8} text="No zones configured" />}
              {zones.map((z) => (
                <tr key={z.zone_id} className={TR} data-testid={`zone-row-${slug(z.zone_id)}`}>
                  <td className={TD}><OrderId id={z.zone_id} /></td>
                  <td className={`${TD} font-medium`}>{z.city}</td>
                  <td className={TD}>{z.assigned_hub}</td>
                  <td className={`${TD} font-mono font-bold`}>{Number(z.households).toLocaleString("en-IN")}</td>
                  <td className={`${TD} font-mono font-bold`}>{kg(z.daily_volume_kg)}</td>
                  <td className={`${TD} font-mono`}>{z.pickups_mapped}</td>
                  <td className={TD}><StatusBadge status={z.status} /></td>
                  {canEdit && (
                    <td className={TD}>
                      <div className="flex gap-1.5">
                        <button type="button" className={`${btnGhost} h-8 px-2.5`} onClick={() => setEditing(z)} data-testid={`edit-zone-${slug(z.zone_id)}`}><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" className={`${btnGhost} h-8 px-2.5 text-rose-600`} onClick={() => remove(z)} data-testid={`delete-zone-${slug(z.zone_id)}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {editing && <ZoneDialog zone={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}
