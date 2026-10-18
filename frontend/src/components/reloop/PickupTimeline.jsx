import { Check, Clock, XCircle, Phone, Truck, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { inr, kg, fmtDate, slug } from "@/lib/format";
import { StatusBadge, OrderId, LoadingBlock } from "@/components/reloop/Primitives";
import { AuthImage } from "@/components/reloop/Files";

const STEPS = [
  { status: "Pending", label: "Request placed", desc: "Your scrap pickup is booked" },
  { status: "Accepted", label: "Partner assigned", desc: "A verified delivery partner accepted it" },
  { status: "In Progress", label: "Pickup in progress", desc: "Partner is on the way" },
  { status: "Completed", label: "Collected & settled", desc: "Scrap weighed and payment settled" },
];

const lastEntry = (history, status) => [...(history || [])].reverse().find((h) => h.status === status);
const FINAL = ["Completed", "Cancelled"];

const Stepper = ({ p }) => {
  const idx = STEPS.findIndex((s) => s.status === p.status);
  const cancelled = p.status === "Cancelled";
  const cancelEntry = lastEntry(p.history, "Cancelled");
  const reached = cancelled ? STEPS.filter((s) => lastEntry(p.history, s.status)).length - 1 : idx;
  return (
    <ol className="relative space-y-5" data-testid="timeline-steps">
      {STEPS.map((s, i) => {
        const done = i <= reached;
        const entry = lastEntry(p.history, s.status);
        return (
          <li key={s.status} className="relative flex gap-4" data-testid={`timeline-step-${slug(s.status)}`} data-done={done}>
            {i < STEPS.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-4px)] w-0.5 ${i < reached ? "bg-emerald-500" : "bg-slate-200"}`} />}
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-300"}`}>
              {done ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            </span>
            <div className="min-w-0 pb-1">
              <p className={`text-sm font-semibold ${done ? "text-slate-900" : "text-slate-400"}`}>{s.label}</p>
              <p className="text-xs text-slate-500">{entry?.note || s.desc}</p>
              {entry && <p className="mt-0.5 font-mono text-[11px] text-slate-400">{fmtDate(entry.at)}</p>}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="flex gap-4" data-testid="timeline-step-cancelled">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500 text-white"><XCircle className="h-4 w-4" /></span>
          <div><p className="text-sm font-semibold text-rose-700">Cancelled</p><p className="text-xs text-slate-500">{cancelEntry?.note}</p>
            {cancelEntry && <p className="font-mono text-[11px] text-slate-400">{fmtDate(cancelEntry.at)}</p>}</div>
        </li>
      )}
    </ol>
  );
};

const PartnerCard = ({ p }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" data-testid="timeline-partner-card">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Delivery Partner</p>
    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><User className="h-4 w-4 text-emerald-600" /> {p.assigned_name || p.assigned_to}</p>
    {p.assigned_vehicle && <p className="mt-1 flex items-center gap-2 font-mono text-sm font-bold text-slate-700"><Truck className="h-4 w-4 text-emerald-600" /> {p.assigned_vehicle}</p>}
    {p.assigned_phone && <a href={`tel:${p.assigned_phone}`} className="mt-1 flex items-center gap-2 text-sm text-slate-700"><Phone className="h-4 w-4 text-emerald-600" /> {p.assigned_phone}</a>}
  </div>
);

const Body = ({ p }) => (
  <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
    <Stepper p={p} />
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-4 text-sm">
        {(p.items || [{ material: p.material, weight_kg: p.weight_kg, amount: p.amount }]).map((it) => (
          <div key={it.material} className="flex justify-between gap-2" data-testid={`timeline-item-${slug(it.material)}`}><span className="text-slate-600">{it.material}</span><span className="font-mono font-bold">{kg(it.weight_kg)} · {inr(it.amount)}</span></div>
        ))}
        <div className="mt-2 flex justify-between border-t border-slate-100 pt-2"><span className="text-slate-500">Total</span><span className="font-mono font-bold text-emerald-700">{kg(p.weight_kg)} · {inr(p.amount)}</span></div>
        {p.service_fee > 0 && <div className="mt-1 flex justify-between"><span className="text-slate-500">Service fee ({p.payment_method === "online" ? "Online" : "Cash"})</span><span className="font-mono font-bold">{inr(p.service_fee)} · {p.payment_status === "paid" ? "Paid" : "Due"}</span></div>}
        <p className="mt-3 text-xs text-slate-500">{p.district} · {p.address}</p>
      </div>
      {p.otp && !FINAL.includes(p.status) && (
        <div className="rounded-xl bg-slate-950 p-4 text-white" data-testid="timeline-otp">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pickup OTP — share only with the partner at pickup</p>
          <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.4em] text-emerald-400">{p.otp}</p>
        </div>
      )}
      {p.assigned_to && <PartnerCard p={p} />}
      {p.photos?.length > 0 && (
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Scrap Photos</p>
          <div className="flex flex-wrap gap-2">{p.photos.map((f) => <AuthImage key={f.id} file={f} className="h-16 w-16" testId={`timeline-photo-${f.id}`} />)}</div></div>
      )}
    </div>
  </div>
);

export const PickupTimeline = ({ pickupId, onClose }) => {
  const { data } = usePolling(() => api.get(`/scrap/pickups/${pickupId}`).then((r) => r.data));
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl pt-10 sm:max-w-2xl" data-testid="pickup-timeline-dialog">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">Pickup Timeline <OrderId id={pickupId} /> {data && <StatusBadge status={data.status} testId="timeline-current-status" />}</DialogTitle>
        </DialogHeader>
        {data ? <Body p={data} /> : <LoadingBlock />}
      </DialogContent>
    </Dialog>
  );
};

export const TrackButton = ({ id, onClick }) => (
  <button type="button" onClick={onClick} data-testid={`track-pickup-${id}`} className="group inline-flex items-center gap-1.5">
    <OrderId id={id} /><span className="text-xs font-semibold text-emerald-600 group-hover:underline">Track</span>
  </button>
);
