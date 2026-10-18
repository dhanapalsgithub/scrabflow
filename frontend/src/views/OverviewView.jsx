import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { useState } from "react";
import { inr, kg, fmtDate, btnPrimary, slug } from "@/lib/format";
import { MetricCard, Panel, PageHeader, StatusBadge, LoadingBlock } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";
import { DataTable } from "@/components/reloop/DataTable";
import { PickupTimeline, TrackButton } from "@/components/reloop/PickupTimeline";

const SUBTITLES = {
  public: "Track your scrap pickups and earnings in real time.",
  corporate: "Bulk dispatch overview for your organisation.",
  delivery_partner: "Today's pickup demand and disbursement status.",
  partner: "Hub network health across your zones.",
  admin: "Full system oversight across users, revenue and operations.",
};

const CTA = {
  public: { to: "/dashboard/sell", label: "Sell your scrap" },
  corporate: { to: "/dashboard/sell", label: "New bulk pickup" },
  delivery_partner: { to: "/dashboard/pickups", label: "Open pickup board" },
  partner: { to: "/dashboard/areas", label: "Manage zones" },
  admin: { to: "/dashboard/pickups", label: "View all pickups" },
};

const Bars = ({ rows, valueKey, labelKey, fmt }) => {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r[labelKey]} data-testid={`bar-${slug(r[labelKey])}`}>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="font-medium text-slate-700">{r[labelKey]}</span>
            <span className="font-mono font-bold text-slate-900">{fmt(r[valueKey])}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${(r[valueKey] / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const RECENT_COLS = [
  { label: "Order ID", key: "id" }, { label: "Material", key: "material" }, { label: "Weight (kg)", key: "weight_kg" },
  { label: "Amount (INR)", key: "amount" }, { label: "Customer", key: "customer_email" }, { label: "District", key: "district" },
  { label: "Status", key: "status" }, { label: "Date", key: "created_at" },
];

export default function OverviewView() {
  const { user } = useAuth();
  const [tracking, setTracking] = useState(null);
  const { data, loading, lastSync, refresh } = usePolling(() => api.get("/scrap/dashboard/summary").then((r) => r.data));
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const cta = CTA[user.role];
  const recentCols = [
    { label: "Order ID", render: (p) => <TrackButton id={p.id} onClick={() => setTracking(p.id)} /> },
    { label: "Material", key: "material" },
    { label: "Weight", render: (p) => <span className="font-mono font-bold">{kg(p.weight_kg)}</span> },
    { label: "Amount", render: (p) => <span className="font-mono font-bold text-slate-900">{inr(p.amount)}</span> },
    { label: "District", key: "district" },
    { label: "Status", render: (p) => <StatusBadge status={p.status} /> },
    { label: "Date", render: (p) => <span className="text-slate-500">{fmtDate(p.created_at)}</span> },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome back, ${(user.name || "").split(" ")[0]}`} subtitle={SUBTITLES[user.role]}>
        <LiveSync lastSync={lastSync} onRefresh={refresh} />
        <Link to={cta.to} className={btnPrimary} data-testid="overview-cta-btn">{cta.label} <ArrowRight className="h-4 w-4" /></Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.cards.map((c, i) => <MetricCard key={c.key} {...c} index={i} testId={`metric-${c.key}`} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Material Mix" subtitle="Recycled volume by material" className="lg:col-span-3" testId="material-mix-panel">
          <Bars rows={data.by_material} valueKey="kg" labelKey="material" fmt={kg} />
        </Panel>
        <Panel title="Order Pipeline" subtitle={`${data.total_orders} orders`} className="lg:col-span-2" testId="status-pipeline-panel">
          <ul className="space-y-3">
            {data.by_status.map((s) => (
              <li key={s.status} className="flex items-center justify-between">
                <StatusBadge status={s.status} />
                <span className="font-mono text-lg font-extrabold text-slate-900" data-testid={`pipeline-count-${slug(s.status)}`}>{s.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {data.by_district.length > 0 && (
        <Panel title="District Performance" subtitle="Volume and value by district" testId="district-panel">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.by_district.map((d) => (
              <div key={d.district} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-slate-800">{d.district}</p>
                <p className="mt-2 font-mono text-xl font-extrabold text-slate-900">{kg(d.kg)}</p>
                <p className="text-xs text-slate-500">{d.orders} orders · {inr(d.amount)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <DataTable testId="recent-activity-panel" title="Recent Activity" subtitle="Latest pickup requests" columns={recentCols} rows={data.recent}
        searchKeys={["id", "material", "district", "status"]} exportName="recent-pickups" exportColumns={RECENT_COLS} pageSize={5} emptyText="No pickups yet" />
      {tracking && <PickupTimeline pickupId={tracking} onClose={() => setTracking(null)} />}
    </div>
  );
}
