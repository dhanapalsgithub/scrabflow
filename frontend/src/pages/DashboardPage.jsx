import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { sectionsFor, labelFor } from "@/lib/menu";
import { SidebarContent, Logo } from "@/components/reloop/Sidebar";
import OverviewView from "@/views/OverviewView";
import SellScrapForm from "@/views/SellScrapForm";
import UserPickupsList from "@/views/UserPickupsList";
import RealPickupsList from "@/views/RealPickupsList";
import AreaManagementView from "@/views/AreaManagementView";
import UsersView from "@/views/UsersView";
import ComplianceView from "@/views/ComplianceView";
import SettingsView from "@/views/SettingsView";
import RatesView from "@/views/RatesView";
import ProfileView from "@/views/ProfileView";
import VerificationView from "@/views/VerificationView";
import KycReviewView from "@/views/KycReviewView";
import HelpView from "@/views/HelpView";

const VIEWS = {
  overview: OverviewView,
  sell: SellScrapForm,
  "my-pickups": UserPickupsList,
  pickups: RealPickupsList,
  assigned: () => <RealPickupsList mode="assigned" />,
  areas: AreaManagementView,
  users: UsersView,
  compliance: ComplianceView,
  settings: SettingsView,
  rates: RatesView,
  profile: ProfileView,
  verification: VerificationView,
  kyc: KycReviewView,
  help: HelpView,
};

export default function DashboardPage() {
  const { section = "overview" } = useParams();
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user) api.get("/me").then((r) => updateUser(r.data)).catch(() => {});
  }, [user?.email, section, updateUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Navigate to="/login" replace />;
  if (!sectionsFor(user).includes(section)) return <Navigate to="/dashboard/overview" replace />;

  const View = VIEWS[section];
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 lg:block" data-testid="sidebar">
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-slate-800 bg-slate-950 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent user={user} onLogout={handleLogout} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Logo dark={false} />
          <button type="button" data-testid="mobile-menu-btn" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white">
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid={`view-${section}`}>
          <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">ReLoop / {labelFor(section)}</p>
          <View />
        </main>
      </div>
    </div>
  );
}
