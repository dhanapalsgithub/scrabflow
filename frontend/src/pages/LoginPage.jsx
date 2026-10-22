import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, Leaf, Truck, Building2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/menu";
import { inputCls } from "@/lib/format";
import { Logo } from "@/components/reloop/Sidebar";
import { Input } from "@/components/ui/input";
import { UiSelect } from "@/components/reloop/Fields";

const HIGHLIGHTS = [
  { icon: Leaf, text: "Sell household & industrial scrap at transparent rates" },
  { icon: Truck, text: "Live pickup tracking synced across every role" },
  { icon: Building2, text: "Zone-level routing, compliance & ESG reporting" },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ role: "public", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard/overview" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(form.email.trim(), form.password, form.role);
      navigate("/dashboard/overview");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-slate-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <Logo />
        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Circular waste operations</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">Every kilo of scrap, tracked from doorstep to hub.</h1>
          <ul className="mt-10 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-slate-300">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-emerald-400"><Icon className="h-4 w-4" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="font-mono text-xs text-slate-500">Chennai · Madurai · Coimbatore</p>
      </aside>

      <main className="flex items-center justify-center bg-[#f4f6f9] px-5 py-12">
        <form onSubmit={submit} data-testid="login-form" className="rise w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="lg:hidden"><Logo dark={false} /></div>
          <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900 lg:mt-0">Sign in to ReLoop</h2>
          <p className="mt-1 text-sm text-slate-500">Choose your role and use your work email.</p>

          {error && (
            <div data-testid="login-error" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-slate-500">Role</label>
          <div className="mt-2"><UiSelect testId="login-role-select" value={form.role} onChange={(v) => setForm({ ...form, role: v })} className="h-11"
            options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} /></div>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500">Work Email</label>
          <Input data-testid="login-email-input" type="email" required value={form.email} onChange={set("email")} placeholder="you@company.com" className={`${inputCls} mt-2`} />

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500">Password</label>
          <Input data-testid="login-password-input" type="password" required value={form.password} onChange={set("password")} placeholder="••••••••" className={`${inputCls} mt-2`} />

          <button data-testid="login-submit-btn" type="submit" disabled={busy} className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
          </button>

          <p className="mt-4 text-center text-sm text-slate-500">
            Don't have an account? <Link to="/register" className="font-semibold text-emerald-600 hover:underline">Sign up</Link>
          </p>
        </form>
      </main>
    </div>
  );
}