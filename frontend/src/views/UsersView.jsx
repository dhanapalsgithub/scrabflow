import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { ROLE_LABELS } from "@/lib/menu";
import { inr, fmtDate, TH, TD, TR, inputCls, selectSm, btnPrimary, btnGhost } from "@/lib/format";
import { Panel, PageHeader, LoadingBlock, EmptyRow, ExportButton, MetricCard } from "@/components/reloop/Primitives";

const COLS = [
  { label: "Name", key: "name" }, { label: "Email", key: "email" }, { label: "Role", key: "role" }, { label: "Organization", key: "organization" },
  { label: "District", key: "district" }, { label: "Orders", key: "orders" }, { label: "Order Value (INR)", key: "order_value" },
  { label: "Active", key: "active" }, { label: "Last Login", key: "last_login" }, { label: "Created", key: "created_at" },
];
const EMPTY = { name: "", email: "", password: "", role: "public", organization: "", phone: "", district: "" };

const AddUserDialog = ({ onClose, onSaved }) => {
  const [form, setForm] = useState(EMPTY);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/users", form);
      toast.success(`User ${form.email} created`);
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="rounded-2xl sm:max-w-lg" data-testid="add-user-dialog">
        <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <input data-testid="new-user-name" required placeholder="Full name" value={form.name} onChange={set("name")} className={inputCls} />
          <input data-testid="new-user-email" required type="email" placeholder="Email" value={form.email} onChange={set("email")} className={inputCls} />
          <input data-testid="new-user-password" required minLength={6} type="password" placeholder="Password (min 6)" value={form.password} onChange={set("password")} className={inputCls} />
          <select data-testid="new-user-role" value={form.role} onChange={set("role")} className={inputCls}>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input data-testid="new-user-org" placeholder="Organization" value={form.organization} onChange={set("organization")} className={inputCls} />
          <input data-testid="new-user-district" placeholder="District" value={form.district} onChange={set("district")} className={inputCls} />
          <button data-testid="new-user-save-btn" type="submit" className={`${btnPrimary} sm:col-span-2`}>Create User</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function UsersView() {
  const { user: me } = useAuth();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const { data, loading, refresh } = usePolling(() => api.get("/admin/users").then((r) => r.data));

  const patch = async (u, body) => {
    try {
      await api.put(`/admin/users/${u.id}`, body);
      toast.success(`Updated ${u.email}`);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };
  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.email}?`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast.success(`Deleted ${u.email}`);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (loading && !data) return <LoadingBlock />;
  const needle = q.trim().toLowerCase();
  const rows = data.filter((u) => (role === "all" || u.role === role) && (!needle || `${u.name} ${u.email} ${u.organization}`.toLowerCase().includes(needle)));
  const count = (r) => data.filter((u) => u.role === r).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Manage accounts, roles and access across ReLoop.">
        <ExportButton filename="users" columns={COLS} rows={rows} />
        <button type="button" className={btnPrimary} onClick={() => setAdding(true)} data-testid="add-user-btn"><Plus className="h-4 w-4" /> Add User</button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Users" value={data.length} format="number" testId="users-metric-total" />
        <MetricCard label="Customers" value={count("public") + count("corporate")} format="number" hint="Public + Corporate" index={1} testId="users-metric-customers" />
        <MetricCard label="Partners" value={count("partner") + count("delivery_partner")} format="number" hint="Hub + Delivery" index={2} testId="users-metric-partners" />
        <MetricCard label="Active Accounts" value={data.filter((u) => u.active !== false).length} format="number" index={3} testId="users-metric-active" />
      </div>
      <Panel bodyClass="p-0" testId="users-table" title={`${rows.length} users`}
        actions={<>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input data-testid="users-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" className={`${inputCls} h-10 w-56 pl-9`} /></div>
          <select data-testid="users-role-filter" value={role} onChange={(e) => setRole(e.target.value)} className={`${selectSm} h-10`}>
            <option value="all">All roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/80"><tr>{["User", "Role", "Organization", "Orders", "Order Value", "Last Login", "Active", ""].map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={8} />}
              {rows.map((u) => {
                const self = u.email === me.email;
                return (
                  <tr key={u.id} className={TR} data-testid={`user-row-${u.email}`}>
                    <td className={TD}><p className="font-semibold text-slate-900">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                    <td className={TD}>
                      <select data-testid={`user-role-select-${u.email}`} disabled={self} value={u.role} onChange={(e) => patch(u, { role: e.target.value })} className={selectSm}>
                        {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className={TD}>{u.organization || "—"}</td>
                    <td className={`${TD} font-mono font-bold`}>{u.orders}</td>
                    <td className={`${TD} font-mono font-bold`}>{inr(u.order_value)}</td>
                    <td className={`${TD} text-slate-500`}>{fmtDate(u.last_login)}</td>
                    <td className={TD}><Switch data-testid={`user-active-toggle-${u.email}`} disabled={self} checked={u.active !== false} onCheckedChange={(v) => patch(u, { active: v })} /></td>
                    <td className={TD}>{!self && <button type="button" className={`${btnGhost} h-8 px-2.5 text-rose-600`} onClick={() => remove(u)} data-testid={`delete-user-${u.email}`}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {adding && <AddUserDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
    </div>
  );
}
