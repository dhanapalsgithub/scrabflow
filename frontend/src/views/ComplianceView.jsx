import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate, TH, TD, TR, slug } from "@/lib/format";
import { Panel, PageHeader, LoadingBlock, EmptyRow, ExportButton, MetricCard, OrderId } from "@/components/reloop/Primitives";
import { LiveSync } from "@/components/reloop/LiveSync";

const MAT_COLS = [{ label: "Material", key: "material" }, { label: "Orders", key: "orders" }, { label: "Kg Diverted", key: "kg" }, { label: "CO2 Saved (kg)", key: "co2_saved_kg" }];
const CERT_COLS = [{ label: "Certificate", key: "id" }, { label: "Order ID", key: "order_id" }, { label: "Material", key: "material" }, { label: "Kg", key: "kg" }, { label: "Customer", key: "customer_email" }, { label: "Issued", key: "issued_at" }];
const MONTH_COLS = [{ label: "Month", key: "month" }, { label: "Orders", key: "orders" }, { label: "Kg", key: "kg" }, { label: "Amount (INR)", key: "amount" }];

const SimpleTable = ({ heads, children, empty, cols }) => (
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="border-b border-slate-200 bg-slate-50/80"><tr>{heads.map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
      <tbody>{empty ? <EmptyRow cols={cols} text="No completed pickups yet" /> : children}</tbody>
    </table>
  </div>
);

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
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Diversion by Material" bodyClass="p-0" testId="compliance-material-table" actions={<ExportButton filename="compliance-materials" columns={MAT_COLS} rows={data.by_material} />}>
          <SimpleTable heads={["Material", "Orders", "Kg Diverted", "CO₂ Saved"]} cols={4}>
            {data.by_material.map((m) => (
              <tr key={m.material} className={TR} data-testid={`compliance-material-${slug(m.material)}`}>
                <td className={`${TD} font-medium`}>{m.material}</td><td className={`${TD} font-mono`}>{m.orders}</td>
                <td className={`${TD} font-mono font-bold`}>{kg(m.kg)}</td><td className={`${TD} font-mono font-bold text-emerald-700`}>{kg(m.co2_saved_kg)}</td>
              </tr>
            ))}
          </SimpleTable>
        </Panel>
        <Panel title="Monthly Summary" bodyClass="p-0" testId="compliance-monthly-table" actions={<ExportButton filename="compliance-monthly" columns={MONTH_COLS} rows={data.monthly} />}>
          <SimpleTable heads={["Month", "Orders", "Kg", "Value"]} cols={4} empty={!data.monthly.length}>
            {data.monthly.map((m) => (
              <tr key={m.month} className={TR}>
                <td className={`${TD} font-mono font-bold`}>{m.month}</td><td className={`${TD} font-mono`}>{m.orders}</td>
                <td className={`${TD} font-mono`}>{kg(m.kg)}</td><td className={`${TD} font-mono font-bold`}>{inr(m.amount)}</td>
              </tr>
            ))}
          </SimpleTable>
        </Panel>
      </div>
      <Panel title="Recycling Certificates" subtitle="Issued automatically for each completed pickup" bodyClass="p-0" testId="compliance-certificates-table"
        actions={<ExportButton filename="recycling-certificates" columns={CERT_COLS} rows={data.certificates} />}>
        <SimpleTable heads={["Certificate", "Order", "Material", "Weight", "Customer", "Issued"]} cols={6} empty={!data.certificates.length}>
          {data.certificates.map((c) => (
            <tr key={c.id} className={TR}>
              <td className={TD}><OrderId id={c.id} /></td><td className={`${TD} font-mono text-xs`}>{c.order_id}</td><td className={TD}>{c.material}</td>
              <td className={`${TD} font-mono font-bold`}>{kg(c.kg)}</td><td className={TD}>{c.customer_email}</td><td className={`${TD} text-slate-500`}>{fmtDate(c.issued_at)}</td>
            </tr>
          ))}
        </SimpleTable>
      </Panel>
    </div>
  );
}
