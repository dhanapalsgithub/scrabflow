import { LayoutDashboard, Recycle, History, IndianRupee, User, Truck, ClipboardCheck, Map, Users, ShieldCheck, Settings, BadgeCheck, LifeBuoy } from "lucide-react";

const ITEMS = {
  overview: { label: "Overview", icon: LayoutDashboard },
  sell: { label: "Sell Your Scrap", icon: Recycle },
  "my-pickups": { label: "My Pickups", icon: History },
  rates: { label: "Price Rates", icon: IndianRupee },
  compliance: { label: "Compliance & ESG", icon: ShieldCheck },
  pickups: { label: "All Pickups", icon: Truck },
  assigned: { label: "My Assignments", icon: ClipboardCheck },
  areas: { label: "Area Management", icon: Map },
  users: { label: "Users", icon: Users },
  settings: { label: "Global Settings", icon: Settings },
  verification: { label: "Verification", icon: BadgeCheck },
  kyc: { label: "Partner Verification", icon: BadgeCheck },
  profile: { label: "Profile", icon: User },
  help: { label: "Help & Guide", icon: LifeBuoy },
};

export const ROLE_MENUS = {
  public: ["overview", "sell", "my-pickups", "rates", "profile", "help"],
  corporate: ["overview", "sell", "my-pickups", "compliance", "rates", "profile", "help"],
  delivery_partner: ["overview", "verification", "pickups", "assigned", "areas", "rates", "profile", "help"],
  partner: ["overview", "areas", "pickups", "rates", "profile", "help"],
  admin: ["overview", "users", "kyc", "pickups", "areas", "compliance", "settings", "profile", "help"],
};

export const ROLE_LABELS = {
  admin: "Admin",
  public: "Public User",
  corporate: "Corporate Client",
  partner: "Business Partner",
  delivery_partner: "Delivery Partner",
};

export const sectionsFor = (user) =>
  (ROLE_MENUS[user.role] || []).filter((k) => !(k === "settings" && (user.admin_scope || "All") !== "All"));
export const menuFor = (user) => sectionsFor(user).map((key) => ({ key, ...ITEMS[key] }));
export const labelFor = (key) => ITEMS[key]?.label || key;
