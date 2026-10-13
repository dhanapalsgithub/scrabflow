import { useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/lib/menu";
import { inputCls, btnPrimary } from "@/lib/format";
import { Panel, PageHeader } from "@/components/reloop/Primitives";

const Field = ({ label, children }) => (
  <div><label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>{children}</div>
);

const PasswordForm = () => {
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put("/me/password", pw);
      toast.success("Password updated");
      setPw({ current_password: "", new_password: "" });
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };
  return (
    <form onSubmit={save} className="space-y-4" data-testid="password-form">
      <Field label="Current Password"><input data-testid="current-password-input" type="password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className={inputCls} /></Field>
      <Field label="New Password"><input data-testid="new-password-input" type="password" required minLength={6} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className={inputCls} /></Field>
      <button type="submit" className={btnPrimary} data-testid="change-password-btn">Update Password</button>
    </form>
  );
};

export default function ProfileView() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: user.name || "", phone: user.phone || "", organization: user.organization || "", district: user.district || "", address: user.address || "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.put("/me", form);
      updateUser(data);
      toast.success("Profile saved");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div>
      <PageHeader title="Profile" subtitle={`${user.email} · ${ROLE_LABELS[user.role]}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Account Details" className="lg:col-span-2">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" data-testid="profile-form">
            <Field label="Full Name"><input data-testid="profile-name-input" required value={form.name} onChange={set("name")} className={inputCls} /></Field>
            <Field label="Phone"><input data-testid="profile-phone-input" value={form.phone} onChange={set("phone")} className={inputCls} /></Field>
            <Field label="Organization"><input data-testid="profile-org-input" value={form.organization} onChange={set("organization")} className={inputCls} /></Field>
            <Field label="District"><input data-testid="profile-district-input" value={form.district} onChange={set("district")} className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Default Pickup Address"><input data-testid="profile-address-input" value={form.address} onChange={set("address")} className={inputCls} /></Field></div>
            <div className="sm:col-span-2"><button type="submit" className={btnPrimary} data-testid="save-profile-btn">Save Profile</button></div>
          </form>
        </Panel>
        <Panel title="Change Password"><PasswordForm /></Panel>
      </div>
    </div>
  );
}
