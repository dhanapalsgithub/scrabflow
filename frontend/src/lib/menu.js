import { LayoutDashboard, Recycle, History, IndianRupee, User, Truck, ClipboardCheck, Map, Users, ShieldCheck, Settings } from "lucide-react";

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
  profile: { label: "Profile", icon: User },
};

export const ROLE_MENUS = {
  public: ["overview", "sell", "my-pickups", "rates", "profile"],
  corporate: ["overview", "sell", "my-pickups", "compliance", "rates", "profile"],
  delivery_partner: ["overview", "pickups", "assigned", "areas", "rates", "profile"],
  partner: ["overview", "areas", "pickups", "rates", "profile"],
  admin: ["overview", "users", "pickups", "areas", "compliance", "settings", "profile"],
};

export const ROLE_LABELS = {
  admin: "Admin",
  public: "Public User",
  corporate: "Corporate Client",
  partner: "Business Partner",
  delivery_partner: "Delivery Partner",
};

export const menuFor = (role) => (ROLE_MENUS[role] || []).map((key) => ({ key, ...ITEMS[key] }));
export const labelFor = (key) => ITEMS[key]?.label || key;
