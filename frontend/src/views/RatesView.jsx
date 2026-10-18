import { useState } from "react";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { inr, inputCls, slug } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Panel, PageHeader, LoadingBlock } from "@/components/reloop/Primitives";

export default function RatesView() {
  const [qty, setQty] = useState(10);
  const { data, loading } = usePolling(() => api.get("/settings").then((r) => r.data), 30000);
  if (loading && !data) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <PageHeader title="Price Rates" subtitle={`Current buyback rates across ${data.service_districts.join(", ")}.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.keys(data.rates).map((m, i) => (
          <div key={m} className="rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" style={{ animationDelay: `${i * 60}ms` }} data-testid={`rate-card-${slug(m)}`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{m}</p>
            <p className="mt-3 font-mono text-3xl font-extrabold text-slate-900">{inr(data.rates[m])}<span className="text-sm font-semibold text-slate-400"> /kg</span></p>
            <p className="mt-1 font-mono text-xs text-slate-500">{inr(data.rates[m] * 1000)} / ton</p>
          </div>
        ))}
      </div>
      <Panel title="Quick Estimate" subtitle="See what your scrap is worth">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="w-full md:w-56">
            <Input data-testid="rates-qty-input" type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} font-mono font-bold`} />
            <p className="mt-1 text-xs text-slate-500">Kilograms</p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
            {Object.keys(data.rates).map((m) => (
              <div key={m} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{m}</p>
                <p className="font-mono text-lg font-extrabold text-emerald-700" data-testid={`estimate-${slug(m)}`}>{inr((parseFloat(qty) || 0) * data.rates[m])}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
