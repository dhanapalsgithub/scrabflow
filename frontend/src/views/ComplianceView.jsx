import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate } from "@/lib/format";
import { PageHeader, LoadingBlock, MetricCard, OrderId } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";
import { DataTable } from "@/components/reloop/DataTable";

const MAT_COLS = [{ label: "Material", key: "material" }, { label: "Orders", key: "orders" }, { label: "Kg Diverted", key: "kg" }, { label: "CO2 Saved (kg)", key: "co2_saved_kg" }];
const CERT_COLS = [{ label: "Certificate", key: "id" }, { label: "Order ID", key: "order_id" }, { label: "Material", key: "material" }, { label: "Kg", key: "kg" }, { label: "Customer", key: "customer_email" }, { label: "Issued", key: "issued_at" }];
const MONTH_COLS = [{ label: "Month", key: "month" }, { label: "Orders", key: "orders" }, { label: "Kg", key: "kg" }, { label: "Amount (INR)", key: "amount" }];

const mono = (fmt, k, cls = "font-bold") => (r) => <span className={`font-mono ${cls}`}>{fmt ? fmt(r[k]) : r[k]}</span>;
const MAT_TABLE = [
  { label: "Material", key: "material", className: "font-medium" }, { label: "Orders", render: mono(null, "orders", "") },
  { label: "Kg Diverted", render: mono(kg, "kg") }, { label: "CO₂ Saved", render: mono(kg, "co2_saved_kg", "font-bold text-emerald-700") },
];
const MONTH_TABLE = [
  { label: "Month", render: mono(null, "month") }, { label: "Orders", render: mono(null, "orders", "") },
  { label: "Kg", render: mono(kg, "kg", "") }, { label: "Value", render: mono(inr, "amount") },
];
const CERT_TABLE = [
  { label: "Certificate", render: (c) => <OrderId id={c.id} /> }, { label: "Order", render: mono(null, "order_id", "text-xs") },
  { label: "Material", key: "material" }, { label: "Weight", render: mono(kg, "kg") },
  { label: "Customer", key: "customer_email" }, { label: "Issued", render: (c) => <span className="text-slate-500">{fmtDate(c.issued_at)}</span> },
];

export default function ComplianceView() {
  const { data, loading, refresh, lastSync } = usePolling(() => api.get("/compliance").then((r) => r.data));
  if (loading && !data) return <LoadingBlock />;
  const s = data.summary;

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance & ESG Reports" subtitle="Landfill diversion, carbon savings and recycling certificates from completed pickups.">
        <LiveSync lastSync={lastSync} onRefresh={refresh} />
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Waste Diverted" value={s.kg_diverted} format="kg" hint="Completed pickups" testId="compliance-kg" />
        <MetricCard label="CO₂ Saved" value={s.co2_saved_kg} format="kg" hint="Estimated emissions avoided" index={1} testId="compliance-co2" />
        <MetricCard label="Completion Rate" value={`${s.completion_rate}%`} format="text" hint={`${s.total_orders} total orders`} index={2} testId="compliance-completion" />
        <MetricCard label="Cancellation Rate" value={`${s.cancellation_rate}%`} format="text" index={3} testId="compliance-cancellation" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <DataTable testId="compliance-material-table" title="Diversion by Material" rowKey="material" columns={MAT_TABLE} rows={data.by_material}
          dateKey={null} searchKeys={["material"]} exportName="compliance-materials" exportColumns={MAT_COLS} pageSize={5} />
        <DataTable testId="compliance-monthly-table" title="Monthly Summary" rowKey="month" columns={MONTH_TABLE} rows={data.monthly}
          dateKey="month" searchKeys={["month"]} exportName="compliance-monthly" exportColumns={MONTH_COLS} pageSize={5} emptyText="No completed pickups yet" />
      </div>
      <DataTable testId="compliance-certificates-table" title="Recycling Certificates" subtitle="Issued automatically for each completed pickup"
        columns={CERT_TABLE} rows={data.certificates} dateKey="issued_at" searchKeys={["id", "order_id", "material", "customer_email"]}
        exportName="recycling-certificates" exportColumns={CERT_COLS} emptyText="No completed pickups yet" />
    </div>
  );
}
