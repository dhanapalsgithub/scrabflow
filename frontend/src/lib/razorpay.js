import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export async function payOnline(pickupId, onPaid) {
  try {
    if (!(await loadScript())) return toast.error("Could not load Razorpay. Check your connection.");
    const { data: order } = await api.post("/payments/razorpay/order", { pickup_id: pickupId });
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: "ReLoop",
      description: `Pickup service fee · ${pickupId}`,
      prefill: { name: order.name, email: order.email, contact: order.contact },
      theme: { color: "#10b981" },
      handler: async (res) => {
        try {
          await api.post("/payments/razorpay/verify", { pickup_id: pickupId, ...res });
          toast.success("Payment successful");
          onPaid?.();
        } catch (err) {
          toast.error(formatApiError(err));
        }
      },
    });
    rzp.on("payment.failed", (r) => toast.error(r.error?.description || "Payment failed"));
    rzp.open();
  } catch (err) {
    toast.error(formatApiError(err));
  }
}
