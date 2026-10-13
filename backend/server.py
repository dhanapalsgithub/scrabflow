from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from seed_data import SEED_USERS, SEED_ZONES, DEFAULT_SETTINGS, SAMPLE_PICKUPS

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

STATUSES = ["Pending", "Accepted", "In Progress", "Completed", "Cancelled"]
MATERIALS = ["Mixed Paper", "Plastics", "E-Waste", "Metals"]
ROLES = ["admin", "public", "corporate", "partner", "delivery_partner"]
CUSTOMER_ROLES = ["public", "corporate"]
OPEN_STATUSES = ["Pending", "Accepted", "In Progress"]
CO2_FACTORS = {"Mixed Paper": 0.9, "Plastics": 1.5, "E-Waste": 2.0, "Metals": 4.0}
NO_ID = {"_id": 0}
USER_PROJ = {"_id": 0, "password_hash": 0}

app = FastAPI(title="ReLoop API")
api = APIRouter(prefix="/api")
logger = logging.getLogger("reloop")
logging.basicConfig(level=logging.INFO)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user: dict) -> str:
    payload = {"sub": user["email"], "role": user["role"], "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(request: Request) -> dict:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(header[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"email": payload["sub"]}, USER_PROJ)
    if not user or not user.get("active", True):
        raise HTTPException(401, "Account not available")
    return user


def require(*roles):
    async def dep(user: dict = Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user
    return dep


# ---------- Models ----------
class LoginIn(BaseModel):
    email: str
    password: str
    role: Optional[str] = None


class PickupCreate(BaseModel):
    material: Literal["Mixed Paper", "Plastics", "E-Waste", "Metals"]
    weight: float = Field(gt=0)
    unit: Literal["Kg", "Tons"] = "Kg"
    district: str = Field(min_length=2)
    address: str = Field(min_length=3)
    phone: Optional[str] = ""
    preferred_date: Optional[str] = ""
    notes: Optional[str] = ""


class StatusUpdate(BaseModel):
    status: Literal["Pending", "Accepted", "In Progress", "Completed", "Cancelled"]


class SettingsUpdate(BaseModel):
    rates: Optional[dict] = None
    platform_name: Optional[str] = None
    support_email: Optional[str] = None
    min_pickup_kg: Optional[float] = Field(default=None, ge=0)
    service_districts: Optional[List[str]] = None


class ZoneIn(BaseModel):
    zone_id: str = Field(min_length=2)
    city: str = Field(min_length=2)
    assigned_hub: str = Field(min_length=2)
    households: int = Field(ge=0)
    daily_volume_kg: float = Field(ge=0)
    status: Literal["Active", "Maintenance", "Inactive"] = "Active"


class UserCreate(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=6)
    name: str = Field(min_length=2)
    role: Literal["admin", "public", "corporate", "partner", "delivery_partner"]
    organization: Optional[str] = ""
    phone: Optional[str] = ""
    district: Optional[str] = ""


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["admin", "public", "corporate", "partner", "delivery_partner"]] = None
    active: Optional[bool] = None
    organization: Optional[str] = None
    phone: Optional[str] = None
    district: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    organization: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# ---------- Helpers ----------
async def get_settings() -> dict:
    return await db.settings.find_one({"key": "global"}, NO_ID) or {**DEFAULT_SETTINGS, "key": "global"}


def money_stats(pickups: List[dict]) -> dict:
    total = sum(p["amount"] for p in pickups if p["status"] != "Cancelled")
    paid = sum(p["amount"] for p in pickups if p["status"] == "Completed")
    pending = sum(p["amount"] for p in pickups if p["status"] in OPEN_STATUSES)
    kg = sum(p["weight_kg"] for p in pickups if p["status"] != "Cancelled")
    return {"total": round(total, 2), "paid": round(paid, 2), "pending": round(pending, 2), "kg": round(kg, 2)}


def breakdowns(pickups: List[dict]) -> dict:
    by_status = {s: 0 for s in STATUSES}
    by_material = {m: {"material": m, "kg": 0.0, "amount": 0.0, "orders": 0} for m in MATERIALS}
    by_district = defaultdict(lambda: {"district": "", "kg": 0.0, "amount": 0.0, "orders": 0})
    for p in pickups:
        by_status[p["status"]] = by_status.get(p["status"], 0) + 1
        if p["status"] == "Cancelled":
            continue
        m = by_material.setdefault(p["material"], {"material": p["material"], "kg": 0.0, "amount": 0.0, "orders": 0})
        m["kg"] += p["weight_kg"]; m["amount"] += p["amount"]; m["orders"] += 1
        d = by_district[p["district"]]
        d["district"] = p["district"]; d["kg"] += p["weight_kg"]; d["amount"] += p["amount"]; d["orders"] += 1
    return {
        "by_status": [{"status": k, "count": v} for k, v in by_status.items()],
        "by_material": [{**v, "kg": round(v["kg"], 2), "amount": round(v["amount"], 2)} for v in by_material.values()],
        "by_district": sorted([{**v, "kg": round(v["kg"], 2), "amount": round(v["amount"], 2)} for v in by_district.values()], key=lambda x: -x["kg"]),
    }


async def zone_metrics(zones: List[dict]) -> dict:
    cities = {z["city"].lower() for z in zones if z["status"] != "Inactive"}
    pickups = await db.pickups.find({}, NO_ID).to_list(5000)
    mapped = [p for p in pickups if p["district"].lower() in cities]
    active = sum(1 for z in zones if z["status"] == "Active")
    maintenance = sum(1 for z in zones if z["status"] == "Maintenance")
    hub_status = "Offline" if active == 0 else ("Partially Operational" if maintenance else "Operational")
    city_counts = defaultdict(int)
    for p in pickups:
        city_counts[p["district"].lower()] += 1
    for z in zones:
        z["pickups_mapped"] = city_counts.get(z["city"].lower(), 0)
    return {
        "active_zones": active,
        "total_pickups_mapped": len(mapped),
        "total_volume_kg": round(sum(p["weight_kg"] for p in mapped if p["status"] != "Cancelled"), 2),
        "hub_status": hub_status,
        "pickups": mapped,
    }


def card(key, label, value, fmt, hint=""):
    return {"key": key, "label": label, "value": value, "format": fmt, "hint": hint}


# ---------- Auth ----------
@api.get("/")
async def root():
    return {"message": "ReLoop API running"}


@api.post("/login")
async def login(body: LoginIn, request: Request):
    email = body.email.strip().lower()
    identifier = f"{request.client.host if request.client else 'na'}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5 and attempt.get("locked_until", "") > now_iso():
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (attempt or {}).get("count", 0) + 1
        locked = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat() if count >= 5 else ""
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": {"count": count, "locked_until": locked}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(403, "This account has been deactivated. Contact an administrator.")
    if body.role and body.role != user["role"]:
        raise HTTPException(401, "Selected role does not match this account")
    await db.login_attempts.delete_one({"identifier": identifier})
    await db.users.update_one({"email": email}, {"$set": {"last_login": now_iso()}})
    profile = await db.users.find_one({"email": email}, USER_PROJ)
    return {"token": create_token(user), "user": profile}


@api.get("/me")
async def me(user: dict = Depends(current_user)):
    return user


@api.put("/me")
async def update_me(body: ProfileUpdate, user: dict = Depends(current_user)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        await db.users.update_one({"email": user["email"]}, {"$set": patch})
    return await db.users.find_one({"email": user["email"]}, USER_PROJ)


@api.put("/me/password")
async def change_password(body: PasswordChange, user: dict = Depends(current_user)):
    doc = await db.users.find_one({"email": user["email"]})
    if not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one({"email": user["email"]}, {"$set": {"password_hash": hash_password(body.new_password), "password_changed": True}})
    return {"ok": True}


# ---------- Settings ----------
@api.get("/settings")
async def read_settings(user: dict = Depends(current_user)):
    return await get_settings()


@api.put("/settings")
async def write_settings(body: SettingsUpdate, user: dict = Depends(require("admin"))):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if "rates" in patch:
        rates = {}
        for m in MATERIALS:
            val = float(patch["rates"].get(m, 0))
            if val < 0:
                raise HTTPException(400, f"Rate for {m} must be positive")
            rates[m] = val
        patch["rates"] = rates
    if "service_districts" in patch:
        patch["service_districts"] = [d.strip() for d in patch["service_districts"] if d.strip()]
    patch["updated_at"] = now_iso()
    patch["updated_by"] = user["email"]
    await db.settings.update_one({"key": "global"}, {"$set": patch}, upsert=True)
    return await get_settings()


# ---------- Pickups ----------
@api.get("/scrap/pickups/all")
async def list_pickups(role: Optional[str] = None, email: Optional[str] = None, status: Optional[str] = None,
                       assigned: Optional[str] = None, user: dict = Depends(current_user)):
    query = {}
    if user["role"] in CUSTOMER_ROLES:
        query["customer_email"] = user["email"]
    elif email:
        query["customer_email"] = email.strip().lower()
    if status and status in STATUSES:
        query["status"] = status
    if assigned == "me":
        query["assigned_to"] = user["email"]
    return await db.pickups.find(query, NO_ID).sort("created_at", -1).to_list(5000)


@api.post("/scrap/pickups/create")
async def create_pickup(body: PickupCreate, user: dict = Depends(require("public", "corporate", "admin"))):
    settings = await get_settings()
    weight_kg = body.weight * 1000 if body.unit == "Tons" else body.weight
    if weight_kg < float(settings.get("min_pickup_kg", 0)):
        raise HTTPException(400, f"Minimum pickup weight is {settings.get('min_pickup_kg')} kg")
    rate = float(settings["rates"].get(body.material, 0))
    ts = now_iso()
    doc = {
        "id": f"RL-{uuid.uuid4().hex[:6].upper()}",
        **body.model_dump(),
        "district": body.district.strip(),
        "address": body.address.strip(),
        "weight_kg": round(weight_kg, 2),
        "rate": rate,
        "amount": round(weight_kg * rate, 2),
        "customer_email": user["email"],
        "customer_name": user.get("name", ""),
        "customer_role": user["role"],
        "status": "Pending",
        "assigned_to": None,
        "history": [{"status": "Pending", "by": user["email"], "at": ts}],
        "created_at": ts,
        "updated_at": ts,
    }
    await db.pickups.insert_one(doc)
    return await db.pickups.find_one({"id": doc["id"]}, NO_ID)


@api.put("/scrap/pickups/{pickup_id}/status")
async def update_status(pickup_id: str, body: StatusUpdate, user: dict = Depends(current_user)):
    pickup = await db.pickups.find_one({"id": pickup_id}, NO_ID)
    if not pickup:
        raise HTTPException(404, "Pickup not found")
    role = user["role"]
    if role in CUSTOMER_ROLES:
        if pickup["customer_email"] != user["email"]:
            raise HTTPException(403, "Not your pickup")
        if body.status != "Cancelled" or pickup["status"] != "Pending":
            raise HTTPException(400, "You can only cancel pickups that are still pending")
    elif role == "delivery_partner":
        if pickup["status"] in ("Completed", "Cancelled"):
            raise HTTPException(400, "This order is already finalized")
    elif role != "admin":
        raise HTTPException(403, "You do not have permission to update pickups")
    ts = now_iso()
    patch = {"status": body.status, "updated_at": ts}
    if role in ("delivery_partner", "admin") and body.status in ("Accepted", "In Progress", "Completed") and not pickup.get("assigned_to"):
        patch["assigned_to"] = user["email"]
    if body.status == "Pending":
        patch["assigned_to"] = None
    if body.status == "Completed":
        patch["settled_at"] = ts
    await db.pickups.update_one({"id": pickup_id}, {"$set": patch, "$push": {"history": {"status": body.status, "by": user["email"], "at": ts}}})
    return await db.pickups.find_one({"id": pickup_id}, NO_ID)


@api.get("/scrap/dashboard/summary")
async def summary(user: dict = Depends(current_user)):
    role = user["role"]
    query = {"customer_email": user["email"]} if role in CUSTOMER_ROLES else {}
    pickups = await db.pickups.find(query, NO_ID).sort("created_at", -1).to_list(5000)
    cards = []
    if role in CUSTOMER_ROLES:
        s = money_stats(pickups)
        cards = [card("requests", "Total Requests", len(pickups), "number", "All pickups raised"),
                 card("kg", "Scrap Recycled", s["kg"], "kg", "Excluding cancelled"),
                 card("earned", "Earnings Received", s["paid"], "inr", "Completed pickups"),
                 card("pending", "Pending Earnings", s["pending"], "inr", "Awaiting completion")]
    elif role == "delivery_partner":
        s = money_stats(pickups)
        mine = sum(1 for p in pickups if p.get("assigned_to") == user["email"] and p["status"] in ("Accepted", "In Progress"))
        cards = [card("total", "Total Volume Amount", s["total"], "inr", "All active & settled orders"),
                 card("paid", "Total Paid / Settled", s["paid"], "inr", "Completed orders"),
                 card("pending", "Pending Disbursements", s["pending"], "inr", "Open orders"),
                 card("mine", "My Active Assignments", mine, "number", "Accepted / In Progress")]
    elif role == "partner":
        zones = await db.zones.find({}, NO_ID).to_list(500)
        zm = await zone_metrics(zones)
        pickups = zm["pickups"]
        cards = [card("zones", "Active Zones", zm["active_zones"], "number", f"{len(zones)} zones total"),
                 card("mapped", "Total Pickups Mapped", zm["total_pickups_mapped"], "number", "Within zone cities"),
                 card("kg", "Total Volume (Kg)", zm["total_volume_kg"], "kg", "Excluding cancelled"),
                 card("hub", "Hub Status", zm["hub_status"], "text", "Live network health")]
    else:
        s = money_stats(pickups)
        users = await db.users.count_documents({})
        cards = [card("total", "Total Revenue Volume", s["total"], "inr", "All active & settled orders"),
                 card("paid", "Settled Payouts", s["paid"], "inr", "Completed orders"),
                 card("pending", "Pending Disbursements", s["pending"], "inr", "Open orders"),
                 card("users", "Registered Users", users, "number", f"{round(s['kg'], 1)} kg recycled")]
    return {"role": role, "cards": cards, **breakdowns(pickups), "recent": pickups[:6], "total_orders": len(pickups)}


# ---------- Zones ----------
@api.get("/zones")
async def list_zones(user: dict = Depends(require("partner", "admin", "delivery_partner"))):
    zones = await db.zones.find({}, NO_ID).sort("zone_id", 1).to_list(500)
    zm = await zone_metrics(zones)
    zm.pop("pickups")
    return {"zones": zones, "metrics": zm}


@api.post("/zones")
async def create_zone(body: ZoneIn, user: dict = Depends(require("partner", "admin"))):
    if await db.zones.find_one({"zone_id": body.zone_id.strip()}):
        raise HTTPException(400, "Zone ID already exists")
    doc = {**body.model_dump(), "zone_id": body.zone_id.strip(), "created_at": now_iso()}
    await db.zones.insert_one(doc)
    return await db.zones.find_one({"zone_id": doc["zone_id"]}, NO_ID)


@api.put("/zones/{zone_id}")
async def update_zone(zone_id: str, body: ZoneIn, user: dict = Depends(require("partner", "admin"))):
    if not await db.zones.find_one({"zone_id": zone_id}):
        raise HTTPException(404, "Zone not found")
    new_id = body.zone_id.strip()
    if new_id != zone_id and await db.zones.find_one({"zone_id": new_id}):
        raise HTTPException(400, "Zone ID already exists")
    await db.zones.update_one({"zone_id": zone_id}, {"$set": {**body.model_dump(), "zone_id": new_id, "updated_at": now_iso()}})
    return await db.zones.find_one({"zone_id": new_id}, NO_ID)


@api.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str, user: dict = Depends(require("partner", "admin"))):
    res = await db.zones.delete_one({"zone_id": zone_id})
    if not res.deleted_count:
        raise HTTPException(404, "Zone not found")
    return {"ok": True}


# ---------- Admin users ----------
@api.get("/admin/users")
async def list_users(user: dict = Depends(require("admin"))):
    users = await db.users.find({}, USER_PROJ).sort("created_at", 1).to_list(2000)
    pickups = await db.pickups.find({}, {"_id": 0, "customer_email": 1, "amount": 1, "status": 1}).to_list(5000)
    counts = defaultdict(lambda: {"orders": 0, "amount": 0.0})
    for p in pickups:
        counts[p["customer_email"]]["orders"] += 1
        if p["status"] != "Cancelled":
            counts[p["customer_email"]]["amount"] += p["amount"]
    for u in users:
        u["orders"] = counts[u["email"]]["orders"]
        u["order_value"] = round(counts[u["email"]]["amount"], 2)
    return users


@api.post("/admin/users")
async def create_user(body: UserCreate, user: dict = Depends(require("admin"))):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "A user with this email already exists")
    doc = {**body.model_dump(exclude={"password"}), "email": email, "id": str(uuid.uuid4()),
           "password_hash": hash_password(body.password), "active": True, "created_at": now_iso()}
    await db.users.insert_one(doc)
    return await db.users.find_one({"email": email}, USER_PROJ)


@api.put("/admin/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user: dict = Depends(require("admin"))):
    target = await db.users.find_one({"id": user_id}, USER_PROJ)
    if not target:
        raise HTTPException(404, "User not found")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if target["email"] == user["email"] and (patch.get("active") is False or patch.get("role", "admin") != "admin"):
        raise HTTPException(400, "You cannot deactivate or demote your own account")
    if patch:
        await db.users.update_one({"id": user_id}, {"$set": patch})
    return await db.users.find_one({"id": user_id}, USER_PROJ)


@api.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require("admin"))):
    target = await db.users.find_one({"id": user_id}, USER_PROJ)
    if not target:
        raise HTTPException(404, "User not found")
    if target["email"] == user["email"]:
        raise HTTPException(400, "You cannot delete your own account")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------- Compliance ----------
@api.get("/compliance")
async def compliance(user: dict = Depends(require("admin", "corporate"))):
    query = {"customer_email": user["email"]} if user["role"] == "corporate" else {}
    pickups = await db.pickups.find(query, NO_ID).to_list(5000)
    done = [p for p in pickups if p["status"] == "Completed"]
    total = len(pickups)
    by_material = []
    for m in MATERIALS:
        items = [p for p in done if p["material"] == m]
        kg = sum(p["weight_kg"] for p in items)
        by_material.append({"material": m, "orders": len(items), "kg": round(kg, 2), "co2_saved_kg": round(kg * CO2_FACTORS[m], 2)})
    monthly = defaultdict(lambda: {"month": "", "orders": 0, "kg": 0.0, "amount": 0.0})
    for p in done:
        key = p["created_at"][:7]
        monthly[key]["month"] = key; monthly[key]["orders"] += 1
        monthly[key]["kg"] += p["weight_kg"]; monthly[key]["amount"] += p["amount"]
    kg_total = sum(r["kg"] for r in by_material)
    return {
        "summary": {
            "total_orders": total,
            "kg_diverted": round(kg_total, 2),
            "co2_saved_kg": round(sum(r["co2_saved_kg"] for r in by_material), 2),
            "completion_rate": round(len(done) / total * 100, 1) if total else 0,
            "cancellation_rate": round(sum(1 for p in pickups if p["status"] == "Cancelled") / total * 100, 1) if total else 0,
        },
        "by_material": by_material,
        "by_district": breakdowns(done)["by_district"],
        "monthly": sorted([{**v, "kg": round(v["kg"], 2), "amount": round(v["amount"], 2)} for v in monthly.values()], key=lambda x: x["month"]),
        "certificates": [{"id": f"CERT-{p['id'][3:]}", "order_id": p["id"], "material": p["material"], "kg": p["weight_kg"],
                          "customer_email": p["customer_email"], "issued_at": p.get("settled_at") or p["updated_at"]} for p in done],
    }


# ---------- Startup seeding ----------
async def seed():
    await db.users.create_index("email", unique=True)
    await db.pickups.create_index("id", unique=True)
    await db.zones.create_index("zone_id", unique=True)
    await db.login_attempts.create_index("identifier")
    accounts = list(SEED_USERS)
    owner_email = os.environ.get("OWNER_EMAIL")
    if owner_email:
        accounts.append({"email": owner_email, "password": os.environ["OWNER_PASSWORD"], "role": "admin", "name": "Platform Owner", "organization": "ReLoop HQ", "district": "Chennai"})
    for acc in accounts:
        existing = await db.users.find_one({"email": acc["email"]})
        if not existing:
            await db.users.insert_one({"id": str(uuid.uuid4()), "email": acc["email"], "name": acc["name"], "role": acc["role"],
                                       "organization": acc["organization"], "district": acc["district"], "phone": "", "address": "",
                                       "active": True, "password_hash": hash_password(acc["password"]), "created_at": now_iso()})
        elif not existing.get("password_changed") and not verify_password(acc["password"], existing["password_hash"]):
            await db.users.update_one({"email": acc["email"]}, {"$set": {"password_hash": hash_password(acc["password"])}})
    if not await db.settings.find_one({"key": "global"}):
        await db.settings.insert_one({**DEFAULT_SETTINGS, "key": "global", "updated_at": now_iso()})
    if await db.zones.count_documents({}) == 0:
        await db.zones.insert_many([{**z, "created_at": now_iso()} for z in SEED_ZONES])
    if await db.pickups.count_documents({}) == 0:
        users = {u["email"]: u for u in await db.users.find({}, USER_PROJ).to_list(100)}
        docs = []
        for i, s in enumerate(SAMPLE_PICKUPS):
            ts = (datetime.now(timezone.utc) - timedelta(days=len(SAMPLE_PICKUPS) - i)).isoformat()
            weight_kg = s["weight"] * 1000 if s["unit"] == "Tons" else s["weight"]
            rate = DEFAULT_SETTINGS["rates"][s["material"]]
            assigned = "test32@gmail.com" if s["status"] in ("Accepted", "In Progress", "Completed") else None
            docs.append({"id": f"RL-{uuid.uuid4().hex[:6].upper()}", "material": s["material"], "weight": s["weight"], "unit": s["unit"],
                         "district": s["district"], "address": s["address"], "phone": "", "preferred_date": "", "notes": "",
                         "weight_kg": weight_kg, "rate": rate, "amount": round(weight_kg * rate, 2), "customer_email": s["email"],
                         "customer_name": users.get(s["email"], {}).get("name", ""), "customer_role": users.get(s["email"], {}).get("role", "public"),
                         "status": s["status"], "assigned_to": assigned, "history": [{"status": s["status"], "by": "system", "at": ts}],
                         "created_at": ts, "updated_at": ts, **({"settled_at": ts} if s["status"] == "Completed" else {})})
        await db.pickups.insert_many(docs)


@app.on_event("startup")
async def on_startup():
    await seed()
    logger.info("ReLoop seed complete")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
