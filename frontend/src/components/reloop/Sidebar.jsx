import { NavLink } from "react-router-dom";
import { LogOut, Recycle } from "lucide-react";
import { menuFor, ROLE_LABELS } from "@/lib/menu";

export const Logo = ({ dark = true }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-white"><Recycle className="h-5 w-5" /></span>
    <span className={`text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>Re<span className="text-emerald-500">Loop</span></span>
  </div>
);

export const SidebarContent = ({ user, onLogout, onNavigate }) => (
  <div className="flex h-full flex-col bg-slate-950 px-4 py-6">
    <div className="px-2"><Logo /></div>
    <p className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Operations</p>
    <nav className="mt-3 flex flex-1 flex-col gap-1 overflow-y-auto" data-testid="sidebar-nav">
      {menuFor(user.role).map(({ key, label, icon: Icon }) => (
        <NavLink
          key={key}
          to={`/dashboard/${key}`}
          onClick={onNavigate}
          data-testid={`nav-${key}`}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-white text-slate-950 shadow-md" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`
          }
        >
          <Icon className="h-[18px] w-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="truncate text-sm font-semibold text-white" data-testid="sidebar-user-name">{user.name}</p>
      <p className="truncate text-xs text-slate-400">{user.email}</p>
      <span className="mt-2 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400" data-testid="sidebar-user-role">{ROLE_LABELS[user.role]}</span>
      <button type="button" onClick={onLogout} data-testid="logout-btn" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </div>
  </div>
);
