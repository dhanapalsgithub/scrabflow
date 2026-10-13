# ReLoop — PRD

## Original problem statement
Build a complete, production-ready Full-Stack Waste Management Web Application named "ReLoop". Roles: admin, public, corporate, partner, delivery_partner with pre-configured accounts. Login page (role dropdown, work email, password, errors; session in localStorage `reloop_user`). Public/Corporate: Sell Your Scrap form (Mixed Paper, Plastics, E-Waste, Metals; district/address; Kg/Tons; auto INR earnings) + pickup status history (Pending, Accepted, In Progress, Completed, Cancelled). Delivery Partner: all pickups, metrics (Total Volume ₹, Paid/Settled ₹, Pending Disbursements ₹), table, Accept Order + status dropdown syncing live to customers. Partner Hub & Area Management: metrics + zones table. Admin: users, compliance reports, revenue metrics, area routing, global settings, CSV export. Endpoints: POST /api/login, GET /api/scrap/pickups/all, POST /api/scrap/pickups/create, PUT /api/scrap/pickups/:id/status, GET /api/scrap/dashboard/summary. Design: slate-950 sidebar, emerald logo, white pill active nav, #f4f6f9 content, white rounded-2xl cards, Inter + bold mono for IDs/weights.

User choices: FastAPI + MongoDB (instead of Node), default rates (Paper ₹12, Plastics ₹18, E-Waste ₹45, Metals ₹35), 8s polling, admin-editable settings in DB, "full operation menu, all menus ready and live for all users".

## Architecture
- Backend: FastAPI `server.py` + `seed_data.py`; MongoDB collections users, pickups, zones, settings, login_attempts. JWT Bearer auth (bcrypt), role guards, idempotent seeding on startup (owner admin from OWNER_EMAIL/OWNER_PASSWORD env).
- Frontend: React + Tailwind; `pages/` (Login, Dashboard), `views/` (Overview, SellScrapForm, UserPickupsList, RealPickupsList, AreaManagementView, UsersView, ComplianceView, SettingsView, RatesView, ProfileView), `components/reloop/`, `lib/` (api, menu, csv, format), `hooks/usePolling` (8s).

## Personas
Household seller, corporate bulk seller, delivery partner, hub/business partner, admin.

## Implemented (2026-10-13)
- All 5 role logins + owner admin; role-based menus, all live with polling
- Sell scrap with live earnings, my pickups with filter/cancel
- Delivery board: metrics, search/filters, Accept Order, status dropdown, My Assignments
- Area management with zone CRUD + metrics
- Admin: users CRUD/role/active, global settings (rates, min kg, districts), compliance/ESG + certificates
- Price rates page, profile + password change, CSV export on all tables
- Testing: 28/28 backend tests, all frontend flows pass

## Backlog
- P1: Pickup detail drawer with status history timeline; delivery route map
- P2: Email/SMS notifications on status change; payout records; pickup delete/archive for admins
