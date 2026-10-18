import { useState } from "react";
import { toast } from "sonner";
import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { ROLE_LABELS } from "@/lib/menu";
import { inr, fmtDate, inputCls, selectSm, btnPrimary, btnGhost } from "@/lib/format";
import { PageHeader, LoadingBlock, MetricCard } from "@/components/reloop/Primitives";
import { DataTable } from "@/components/reloop/DataTable";

const COLS = [
  { label: "Name", key: "name" }, { label: "Email", key: "email" }, { label: "Role", key: "role" }, { label: "Organization", key: "organization" },
  { label: "District", key: "district" }, { label: "Admin Scope", key: "admin_scope" }, { label: "Orders", key: "orders" }, { label: "Order Value (INR)", key: "order_value" },
  { label: "Active", key: "active" }, { label: "Last Login", key: "last_login" }, { label: "Created", key: "created_at" },
];
const EMPTY = { name: "", email: "", password: "", role: "public", organization: "", phone: "", district: "", admin_scope: "All" };

const AddUserDialog = ({ onClose, onSaved, headAdmin }) => {
  const [form, setForm] = useState(EMPTY);
  const [districts, setDistricts] = useState([]);
  useEffect(() => {
    api.get("/settings").then((r) => setDistricts(r.data.service_districts));
  }, []);
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
            {Object.entries(ROLE_LABELS).filter(([v]) => headAdmin || v !== "admin").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {form.role === "admin" && (
            <select data-testid="new-user-admin-scope" value={form.admin_scope} onChange={set("admin_scope")} className={`${inputCls} sm:col-span-2`}>
              <option value="All">Head admin — all districts</option>
              {districts.map((d) => <option key={d} value={d}>District admin — {d}</option>)}
            </select>
          )}
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
  const [role, setRole] = useState("all");
  const headAdmin = (me.admin_scope || "All") === "All";
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
  const rows = data.filter((u) => role === "all" || u.role === role);
  const count = (r) => data.filter((u) => u.role === r).length;
  const columns = [
    { label: "User", render: (u) => <div><p className="font-semibold text-slate-900">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
    { label: "Role", render: (u) => (
      <select data-testid={`user-role-select-${u.email}`} disabled={u.email === me.email || (!headAdmin && u.role === "admin")} value={u.role} onChange={(e) => patch(u, { role: e.target.value })} className={selectSm}>
        {Object.entries(ROLE_LABELS).filter(([v]) => headAdmin || v !== "admin" || u.role === "admin").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>) },
    { label: "District / Scope", render: (u) => <span className="text-sm">{u.role === "admin" ? `Admin: ${u.admin_scope || "All"}` : u.district || "—"}</span> },
    { label: "Orders", render: (u) => <span className="font-mono font-bold">{u.orders}</span> },
    { label: "Order Value", render: (u) => <span className="font-mono font-bold">{inr(u.order_value)}</span> },
    { label: "Last Login", render: (u) => <span className="text-slate-500">{fmtDate(u.last_login)}</span> },
    { label: "Active", render: (u) => <Switch data-testid={`user-active-toggle-${u.email}`} disabled={u.email === me.email} checked={u.active !== false} onCheckedChange={(v) => patch(u, { active: v })} /> },
    { label: "Delete", render: (u) => u.email !== me.email && <button type="button" className={`${btnGhost} h-8 px-2.5 text-rose-600`} onClick={() => remove(u)} data-testid={`delete-user-${u.email}`}><Trash2 className="h-3.5 w-3.5" /></button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Manage accounts, roles and access across ReLoop.">
        <button type="button" className={btnPrimary} onClick={() => setAdding(true)} data-testid="add-user-btn"><Plus className="h-4 w-4" /> Add User</button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Users" value={data.length} format="number" testId="users-metric-total" />
        <MetricCard label="Customers" value={count("public") + count("corporate")} format="number" hint="Public + Corporate" index={1} testId="users-metric-customers" />
        <MetricCard label="Partners" value={count("partner") + count("delivery_partner")} format="number" hint="Hub + Delivery" index={2} testId="users-metric-partners" />
        <MetricCard label="Active Accounts" value={data.filter((u) => u.active !== false).length} format="number" index={3} testId="users-metric-active" />
      </div>
      <DataTable testId="users-table" title={`${rows.length} users`} columns={columns} rows={rows} rowKey="email"
        searchKeys={["name", "email", "organization", "district"]} exportName="users" exportColumns={COLS}
        filters={
          <select data-testid="users-role-filter" value={role} onChange={(e) => setRole(e.target.value)} className={`${selectSm} h-10`}>
            <option value="all">All roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        } />
      {adding && <AddUserDialog headAdmin={headAdmin} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
    </div>
  );
}
