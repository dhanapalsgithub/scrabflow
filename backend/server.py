from dotenv import load_dotenv
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import secrets
import uuid
import asyncio
import logging
import base64
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
import requests
import razorpay
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query, UploadFile, File, Form
from fastapi.responses import Response
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

api = APIRouter(prefix="/api")
logger = logging.getLogger("reloop")
logging.basicConfig(level=logging.INFO)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "reloop"
ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf"}
MAX_FILE_BYTES = 5 * 1024 * 1024
KYC_FILE_CATEGORIES = {"license_file_id": "license", "photo_file_id": "photo", "selfie_file_id": "selfie"}
_storage_key = None


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY", "")}, timeout=10)
        if resp.status_code == 200:
            _storage_key = resp.json().get("storage_key")
            return _storage_key
    except Exception:
        pass
    return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    skey = init_storage()
    if not skey:
        raise Exception("Storage key not available")
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": skey, "Content-Type": content_type}, data=data, timeout=30)
    if resp.status_code == 404:
        skey = init_storage(True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": skey, "Content-Type": content_type}, data=data, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    skey = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": skey}, timeout=30)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


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


class RegisterIn(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=6)
    name: str = Field(min_length=2)
    role: Literal["public", "corporate", "partner", "delivery_partner"] = "public"
    organization: Optional[str] = ""
    phone: Optional[str] = ""
    district: Optional[str] = "Chennai"


class PickupItem(BaseModel):
    material: str = Field(min_length=2)
    weight: float = Field(gt=0)
    unit: Literal["Kg", "Tons"] = "Kg"


class PickupCreate(BaseModel):
    items: List[PickupItem] = Field(min_length=1, max_length=10)
    payment_method: Literal["cod", "online"] = "cod"
    district: str = Field(min_length=2)
    address: str = Field(min_length=3)
    phone: Optional[str] = ""
    preferred_date: Optional[str] = ""
    notes: Optional[str] = ""
    photo_ids: List[str] = Field(default_factory=list, max_length=5)


class StatusUpdate(BaseModel):
    status: Literal["Pending", "Accepted", "In Progress", "Completed", "Cancelled"]
    otp: Optional[str] = None
    cash_collected: Optional[bool] = None


class PaymentOrderIn(BaseModel):
    pickup_id: str


class PaymentVerifyIn(BaseModel):
    pickup_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class SettingsUpdate(BaseModel):
    rates: Optional[dict] = None
    platform_name: Optional[str] = None
    support_email: Optional[str] = None
    min_pickup_kg: Optional[float] = Field(default=None, ge=0)
    service_fee: Optional[float] = Field(default=None, ge=0)
    service_districts: Optional[List[str]] = None
    dispatch_mode: Optional[Literal["open", "admin_assign"]] = None


class AssignIn(BaseModel):
    delivery_email: str


class KycSubmit(BaseModel):
    district: str = Field(min_length=2)
    phone: str = Field(min_length=8)
    vehicle_type: Literal["Bike", "Auto", "Van", "Mini Truck", "Truck"]
    vehicle_number: str = Field(min_length=4)
    license_number: str = Field(min_length=5)
    license_file_id: str
    photo_file_id: str
    selfie_file_id: str


class KycReview(BaseModel):
    action: Literal["approve", "reject"]
    reason: Optional[str] = ""


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
    admin_scope: Optional[str] = "All"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["admin", "public", "corporate", "partner", "delivery_partner"]] = None
    active: Optional[bool] = None
    organization: Optional[str] = None
    phone: Optional[str] = None
    district: Optional[str] = None
    admin_scope: Optional[str] = None


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
    return {**DEFAULT_SETTINGS, "key": "global", **(await db.settings.find_one({"key": "global"}, NO_ID) or {})}


def admin_district(user: dict) -> Optional[str]:
    if user["role"] != "admin":
        return None
    scope = user.get("admin_scope") or "All"
    return None if scope == "All" else scope


def district_filter(user: dict, field: str = "district") -> dict:
    d = admin_district(user)
    return {field: {"$regex": f"^{re.escape(d)}$", "$options": "i"}} if d else {}


def in_scope(user: dict, district: str) -> bool:
    d = admin_district(user)
    return not d or (district or "").lower() == d.lower()


def require_head_admin(user: dict):
    if admin_district(user):
        raise HTTPException(403, "Only head admins (All districts) can do this")


def hist(status: str, user: dict, note: str = "") -> dict:
    return {"status": status, "by": user["email"], "by_name": user.get("name", ""), "by_role": user["role"], "note": note, "at": now_iso()}


def assignee_fields(partner: dict) -> dict:
    kyc = partner.get("kyc") or {}
    return {"assigned_to": partner["email"], "assigned_name": partner.get("name", ""),
            "assigned_phone": kyc.get("phone") or partner.get("phone", ""), "assigned_vehicle": kyc.get("vehicle_number", "")}


CLEAR_ASSIGNEE = {"assigned_to": None, "assigned_name": "", "assigned_phone": "", "assigned_vehicle": ""}


def strip_otp(p: dict, user: dict) -> dict:
    if not (user["role"] in CUSTOMER_ROLES and p.get("customer_email") == user["email"]):
        p.pop("otp", None)
    return p


def items_of(p: dict) -> List[dict]:
    return p.get("items") or [{"material": p["material"], "weight_kg": p["weight_kg"], "amount": p["amount"]}]


def is_verified(user: dict) -> bool:
    return (user.get("kyc") or {}).get("status") == "verified"


DELIVERY_NEXT = {"Accepted": {"In Progress", "Pending"}, "In Progress": {"Completed", "Pending"}}


async def can_view_pickup(user: dict, p: dict) -> bool:
    role = user["role"]
    if role in CUSTOMER_ROLES:
        return p["customer_email"] == user["email"]
    if role == "delivery_partner":
        if p.get("assigned_to") == user["email"]:
            return True
        open_pool = is_verified(user) and (await get_settings()).get("dispatch_mode") != "admin_assign"
        return open_pool and p["status"] == "Pending" and not p.get("assigned_to")
    if role == "admin":
        return in_scope(user, p["district"])
    return True


def money_stats(pickups: List[dict]) -> dict:
    total = sum(p["amount"] for p in pickups if p["status"] != "Cancelled")
    paid = sum(p["amount"] for p in pickups if p["status"] == "Completed")
    pending = sum(p["amount"] for p in pickups if p["status"] in OPEN_STATUSES)
    kg = sum(p["weight_kg"] for p in pickups if p["status"] != "Cancelled")
    return {"total": round(total, 2), "paid": round(paid, 2), "pending": round(pending, 2), "kg": round(kg, 2)}


def breakdowns(pickups: List[dict], materials=MATERIALS) -> dict:
    by_status = {s: 0 for s in STATUSES}
    by_material = {m: {"material": m, "kg": 0.0, "amount": 0.0, "orders": 0} for m in materials}
    by_district = defaultdict(lambda: {"district": "", "kg": 0.0, "amount": 0.0, "orders": 0})
    for p in pickups:
        by_status[p["status"]] = by_status.get(p["status"], 0) + 1
        if p["status"] == "Cancelled":
            continue
        for it in items_of(p):
            m = by_material.setdefault(it["material"], {"material": it["material"], "kg": 0.0, "amount": 0.0, "orders": 0})
            m["kg"] += it["weight_kg"]; m["amount"] += it["amount"]; m["orders"] += 1
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


# ---------- Auth & Registration ----------
@api.get("/")
async def root():
    return {"message": "ReLoop API running"}


@api.post("/register")
async def register_user(body: RegisterIn):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "A user with this email already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name.strip(),
        "role": body.role,
        "organization": body.organization or "",
        "phone": body.phone or "",
        "district": body.district or "Chennai",
        "address": "",
        "active": True,
        "password_hash": hash_password(body.password),
        "created_at": now_iso()
    }
    if body.role == "delivery_partner":
        doc["kyc"] = {"status": "not_submitted"}
    await db.users.insert_one(doc)
    user_doc = await db.users.find_one({"email": email})
    profile = await db.users.find_one({"email": email}, USER_PROJ)
    return {"token": create_token(user_doc), "user": profile}


@api.post("/login")
async def login(body: LoginIn, request: Request):
    email = body.email.strip().lower()
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    identifier = f"{forwarded or (request.client.host if request.client else 'na')}:{email}"
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
    require_head_admin(user)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if "rates" in patch:
        rates = {}
        for m, v in patch["rates"].items():
            name = str(m).strip()
            if len(name) < 2 or not re.fullmatch(r"[A-Za-z0-9 &/()\-]+", name):
                raise HTTPException(400, "Scrap type names can use letters, numbers, spaces and & / ( ) - only")
            if float(v) < 0:
                raise HTTPException(400, f"Rate for {name} must be positive")
            rates[name] = float(v)
        if not rates:
            raise HTTPException(400, "Keep at least one scrap type")
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
    elif user["role"] == "delivery_partner":
        settings = await get_settings()
        if assigned == "me" or settings.get("dispatch_mode") == "admin_assign" or not is_verified(user):
            query["assigned_to"] = user["email"]
        else:
            query["$or"] = [{"assigned_to": user["email"]}, {"status": "Pending"}]
    else:
        query.update(district_filter(user))
        if email:
            query["customer_email"] = email.strip().lower()
        if assigned == "me":
            query["assigned_to"] = user["email"]
    if status and status in STATUSES:
        query["status"] = status
    return [strip_otp(p, user) for p in await db.pickups.find(query, NO_ID).sort("created_at", -1).to_list(5000)]


@api.post("/scrap/pickups/create")
async def create_pickup(body: PickupCreate, user: dict = Depends(require("public", "corporate", "admin"))):
    settings = await get_settings()
    items, seen = [], set()
    for it in body.items:
        if it.material not in settings["rates"]:
            raise HTTPException(400, f"Unknown scrap type: {it.material}")
        if it.material in seen:
            raise HTTPException(400, f"{it.material} is added twice")
        seen.add(it.material)
        wkg = round(it.weight * 1000 if it.unit == "Tons" else it.weight, 2)
        rate = float(settings["rates"][it.material])
        items.append({"material": it.material, "weight": it.weight, "unit": it.unit, "weight_kg": wkg, "rate": rate, "amount": round(wkg * rate, 2)})
    weight_kg = round(sum(i["weight_kg"] for i in items), 2)
    if weight_kg < float(settings.get("min_pickup_kg", 0)):
        raise HTTPException(400, f"Minimum pickup weight is {settings.get('min_pickup_kg')} kg")
    fee = float(settings.get("service_fee", 0))
    if body.payment_method == "online" and fee > 0 and not razorpay_enabled():
        raise HTTPException(400, "Online payment is not available yet. Please choose Cash on Delivery.")
    material_label = " + ".join(i["material"] for i in items)
    photos = []
    for fid in body.photo_ids:
        rec = await db.files.find_one({"id": fid, "owner_email": user["email"], "category": "scrap", "is_deleted": False}, NO_ID)
        if not rec:
            raise HTTPException(400, "One of the scrap photos is invalid. Please re-upload.")
        photos.append({"id": rec["id"], "original_filename": rec["original_filename"], "content_type": rec["content_type"]})
    ts = now_iso()
    doc = {
        "id": f"RL-{uuid.uuid4().hex[:6].upper()}",
        **body.model_dump(exclude={"photo_ids", "items"}),
        "items": items,
        "material": material_label,
        "photos": photos,
        "district": body.district.strip(),
        "address": body.address.strip(),
        "weight_kg": weight_kg,
        "amount": round(sum(i["amount"] for i in items), 2),
        "service_fee": fee,
        "payment_status": "not_required" if fee == 0 else "pending",
        "otp": f"{secrets.randbelow(10000):04d}",
        "customer_email": user["email"],
        "customer_name": user.get("name", ""),
        "customer_role": user["role"],
        "status": "Pending",
        **CLEAR_ASSIGNEE,
        "history": [hist("Pending", user, f"Pickup requested · {weight_kg} kg · {material_label}")],
        "created_at": ts,
        "updated_at": ts,
    }
    await db.pickups.insert_one(doc)
    return await db.pickups.find_one({"id": doc["id"]}, NO_ID)


@api.put("/scrap/pickups/{pickup_id}/status")
async def update_status(pickup_id: str, body: StatusUpdate, user: dict = Depends(current_user)):
    pickup = await db.pickups.find_one({"id": pickup_id}, NO_ID)
    if not pickup or not await can_view_pickup(user, pickup):
        raise HTTPException(404, "Pickup not found")
    role = user["role"]
    if role in CUSTOMER_ROLES:
        if body.status != "Cancelled" or pickup["status"] != "Pending":
            raise HTTPException(400, "You can only cancel pickups that are still pending")
    elif role == "delivery_partner":
        if not is_verified(user):
            raise HTTPException(403, "Complete your verification before handling pickups")
        if pickup["status"] in ("Completed", "Cancelled"):
            raise HTTPException(400, "This order is already finalized")
        if not pickup.get("assigned_to"):
            if (await get_settings()).get("dispatch_mode") == "admin_assign":
                raise HTTPException(403, "Pickups are assigned by the admin right now")
            if body.status != "Accepted":
                raise HTTPException(400, "Accept the order first")
        elif pickup["assigned_to"] != user["email"]:
            raise HTTPException(403, "This order is assigned to another partner")
        elif body.status not in DELIVERY_NEXT.get(pickup["status"], set()):
            raise HTTPException(400, f"Cannot move from {pickup['status']} to {body.status}")
        if body.status == "Completed":
            if (body.otp or "").strip() != pickup.get("otp"):
                raise HTTPException(400, "Incorrect OTP. Ask the customer for the 4-digit pickup code.")
            if pickup.get("payment_method") == "cod" and pickup.get("payment_status") == "pending" and not body.cash_collected:
                raise HTTPException(400, "Confirm that the cash service fee was collected")
    elif role != "admin":
        raise HTTPException(403, "You do not have permission to update pickups")
    ts = now_iso()
    patch = {"status": body.status, "updated_at": ts}
    note = {"Pending": "Returned to the open pool", "In Progress": "Partner is on the way for pickup",
            "Completed": f"Scrap collected · ₹{pickup['amount']} settled", "Cancelled": f"Cancelled by {user.get('name', user['email'])}"}.get(body.status, "")
    if role == "delivery_partner" and not pickup.get("assigned_to"):
        patch.update(assignee_fields(user))
    if body.status == "Accepted":
        name = patch.get("assigned_name") or pickup.get("assigned_name") or ""
        vehicle = patch.get("assigned_vehicle") or pickup.get("assigned_vehicle") or ""
        note = f"Accepted by {name}" + (f" · Vehicle {vehicle}" if vehicle else "") if name else "Order accepted"
    if body.status == "Pending":
        patch.update(CLEAR_ASSIGNEE)
    if body.status == "Completed":
        patch["settled_at"] = ts
        patch["otp_verified"] = role == "delivery_partner"
        if role == "admin":
            note += " · completed by admin"
        if pickup.get("payment_method") == "cod" and pickup.get("payment_status") == "pending" and body.cash_collected:
            patch.update({"payment_status": "paid", "paid_at": ts})
            note += f" · ₹{pickup.get('service_fee', 0)} cash fee collected"
        elif role == "admin" and pickup.get("payment_status") == "pending":
            patch["payment_status"] = "waived"
            note += " · service fee waived"
    await db.pickups.update_one({"id": pickup_id}, {"$set": patch, "$push": {"history": hist(body.status, user, note)}})
    return strip_otp(await db.pickups.find_one({"id": pickup_id}, NO_ID), user)


@api.get("/scrap/dashboard/summary")
async def summary(user: dict = Depends(current_user)):
    role = user["role"]
    query = {"customer_email": user["email"]} if role in CUSTOMER_ROLES else district_filter(user)
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
        users = await db.users.count_documents(district_filter(user))
        cards = [card("total", "Total Revenue Volume", s["total"], "inr", "All active & settled orders"),
                 card("paid", "Settled Payouts", s["paid"], "inr", "Completed orders"),
                 card("pending", "Pending Disbursements", s["pending"], "inr", "Open orders"),
                 card("users", "Registered Users", users, "number", f"{round(s['kg'], 1)} kg recycled")]
    materials = list((await get_settings())["rates"].keys())
    return {"role": role, "cards": cards, **breakdowns(pickups, materials), "recent": [strip_otp(p, user) for p in pickups[:6]], "total_orders": len(pickups)}


# ---------- Zones ----------
@api.get("/zones")
async def list_zones(user: dict = Depends(require("partner", "admin", "delivery_partner"))):
    zones = await db.zones.find(district_filter(user, "city"), NO_ID).sort("zone_id", 1).to_list(500)
    zm = await zone_metrics(zones)
    zm.pop("pickups")
    return {"zones": zones, "metrics": zm}


@api.post("/zones")
async def create_zone(body: ZoneIn, user: dict = Depends(require("partner", "admin"))):
    if not in_scope(user, body.city):
        raise HTTPException(403, "You can only manage zones in your own district")
    if await db.zones.find_one({"zone_id": body.zone_id.strip()}):
        raise HTTPException(400, "Zone ID already exists")
    doc = {**body.model_dump(), "zone_id": body.zone_id.strip(), "created_at": now_iso()}
    await db.zones.insert_one(doc)
    return await db.zones.find_one({"zone_id": doc["zone_id"]}, NO_ID)


@api.put("/zones/{zone_id}")
async def update_zone(zone_id: str, body: ZoneIn, user: dict = Depends(require("partner", "admin"))):
    existing = await db.zones.find_one({"zone_id": zone_id}, NO_ID)
    if not existing or not in_scope(user, existing["city"]):
        raise HTTPException(404, "Zone not found")
    if not in_scope(user, body.city):
        raise HTTPException(403, "You can only manage zones in your own district")
    new_id = body.zone_id.strip()
    if new_id != zone_id and await db.zones.find_one({"zone_id": new_id}):
        raise HTTPException(400, "Zone ID already exists")
    await db.zones.update_one({"zone_id": zone_id}, {"$set": {**body.model_dump(), "zone_id": new_id, "updated_at": now_iso()}})
    return await db.zones.find_one({"zone_id": new_id}, NO_ID)


@api.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str, user: dict = Depends(require("partner", "admin"))):
    res = await db.zones.delete_one({"zone_id": zone_id, **district_filter(user, "city")})
    if not res.deleted_count:
        raise HTTPException(404, "Zone not found")
    return {"ok": True}


# ---------- Admin users ----------
@api.get("/admin/users")
async def list_users(user: dict = Depends(require("admin"))):
    users = await db.users.find(district_filter(user), USER_PROJ).sort("created_at", 1).to_list(2000)
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
    scope = admin_district(user)
    if scope and body.role == "admin":
        raise HTTPException(403, "Only head admins can create admin accounts")
    doc = {**body.model_dump(exclude={"password", "admin_scope"}), "email": email, "id": str(uuid.uuid4()),
           "admin_scope": (body.admin_scope or "All") if body.role == "admin" else None,
           "password_hash": hash_password(body.password), "active": True, "created_at": now_iso()}
    if scope:
        doc["district"] = scope
    if body.role == "delivery_partner":
        doc["kyc"] = {"status": "not_submitted"}
    await db.users.insert_one(doc)
    return await db.users.find_one({"email": email}, USER_PROJ)


@api.put("/admin/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user: dict = Depends(require("admin"))):
    target = await db.users.find_one({"id": user_id}, USER_PROJ)
    if not target or not in_scope(user, target.get("district", "")):
        raise HTTPException(404, "User not found")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if admin_district(user) and (patch.get("role") == "admin" or "admin_scope" in patch or target["role"] == "admin"):
        raise HTTPException(403, "Only head admins can manage admin accounts")
    if "admin_scope" in patch and patch["admin_scope"] != "All" and patch["admin_scope"] not in (await get_settings())["service_districts"]:
        raise HTTPException(400, "Choose a valid district for the admin scope")
    if "district" in patch and not in_scope(user, patch["district"]):
        raise HTTPException(403, "You can only assign users to your own district")
    if patch.get("role") == "delivery_partner" and not target.get("kyc"):
        patch["kyc"] = {"status": "not_submitted"}
    if target["email"] == user["email"] and (patch.get("active") is False or patch.get("role", "admin") != "admin"):
        raise HTTPException(400, "You cannot deactivate or demote your own account")
    if patch:
        await db.users.update_one({"id": user_id}, {"$set": patch})
    return await db.users.find_one({"id": user_id}, USER_PROJ)


@api.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require("admin"))):
    target = await db.users.find_one({"id": user_id}, USER_PROJ)
    if not target or not in_scope(user, target.get("district", "")):
        raise HTTPException(404, "User not found")
    if admin_district(user) and target["role"] == "admin":
        raise HTTPException(403, "Only head admins can manage admin accounts")
    if target["email"] == user["email"]:
        raise HTTPException(400, "You cannot delete your own account")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------- Compliance ----------
@api.get("/compliance")
async def compliance(user: dict = Depends(require("admin", "corporate"))):
    query = {"customer_email": user["email"]} if user["role"] == "corporate" else district_filter(user)
    pickups = await db.pickups.find(query, NO_ID).to_list(5000)
    done = [p for p in pickups if p["status"] == "Completed"]
    total = len(pickups)
    by_material = []
    for m in (await get_settings())["rates"].keys():
        items = [it for p in done for it in items_of(p) if it["material"] == m]
        kg = sum(it["weight_kg"] for it in items)
        by_material.append({"material": m, "orders": len(items), "kg": round(kg, 2), "co2_saved_kg": round(kg * CO2_FACTORS.get(m, 1.0), 2)})
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


# ---------- Pickup detail & assignment ----------
@api.get("/scrap/pickups/{pickup_id}")
async def pickup_detail(pickup_id: str, user: dict = Depends(current_user)):
    pickup = await db.pickups.find_one({"id": pickup_id}, NO_ID)
    if not pickup or not await can_view_pickup(user, pickup):
        raise HTTPException(404, "Pickup not found")
    return strip_otp(pickup, user)


@api.put("/scrap/pickups/{pickup_id}/assign")
async def assign_pickup(pickup_id: str, body: AssignIn, user: dict = Depends(require("admin"))):
    pickup = await db.pickups.find_one({"id": pickup_id}, NO_ID)
    if not pickup or not in_scope(user, pickup["district"]):
        raise HTTPException(404, "Pickup not found")
    if pickup["status"] in ("Completed", "Cancelled"):
        raise HTTPException(400, "This order is already finalized")
    partner = await db.users.find_one({"email": body.delivery_email.strip().lower(), "role": "delivery_partner"}, USER_PROJ)
    if not partner or not partner.get("active", True) or (partner.get("kyc") or {}).get("status") != "verified":
        raise HTTPException(400, "Select a verified, active delivery partner")
    status = pickup["status"] if pickup["status"] in ("Accepted", "In Progress") else "Accepted"
    fields = assignee_fields(partner)
    note = f"Assigned by admin to {fields['assigned_name']}" + (f" · Vehicle {fields['assigned_vehicle']}" if fields["assigned_vehicle"] else "")
    await db.pickups.update_one({"id": pickup_id}, {"$set": {**fields, "status": status, "updated_at": now_iso()},
                                                    "$push": {"history": hist(status, user, note)}})
    return strip_otp(await db.pickups.find_one({"id": pickup_id}, NO_ID), user)


@api.get("/admin/delivery-partners")
async def verified_partners(user: dict = Depends(require("admin"))):
    query = {"role": "delivery_partner", "kyc.status": "verified", "active": {"$ne": False}, **district_filter(user)}
    partners = await db.users.find(query, USER_PROJ).to_list(1000)
    return [{"email": p["email"], "name": p.get("name", ""), "district": p.get("district", ""), "vehicle_number": p["kyc"].get("vehicle_number", "")} for p in partners]


# ---------- Payments (Razorpay) ----------
def razorpay_enabled() -> bool:
    return bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET"))


def razorpay_client():
    if not razorpay_enabled():
        raise HTTPException(503, "Online payments are not configured yet")
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))


async def own_online_pickup(pickup_id: str, user: dict) -> dict:
    p = await db.pickups.find_one({"id": pickup_id, "customer_email": user["email"]}, NO_ID)
    if not p:
        raise HTTPException(404, "Pickup not found")
    if p.get("payment_status") != "pending" or p["status"] in ("Cancelled", "Completed"):
        raise HTTPException(400, "No payment is due for this pickup")
    return p


@api.get("/payments/config")
async def payments_config(user: dict = Depends(current_user)):
    s = await get_settings()
    return {"online_enabled": razorpay_enabled(), "key_id": os.environ.get("RAZORPAY_KEY_ID") or "", "service_fee": s.get("service_fee", 0)}


@api.post("/payments/razorpay/order")
async def create_payment_order(body: PaymentOrderIn, user: dict = Depends(require(*CUSTOMER_ROLES))):
    p = await own_online_pickup(body.pickup_id, user)
    rz = razorpay_client()
    order = await asyncio.to_thread(rz.order.create, {"amount": int(round(p["service_fee"] * 100)), "currency": "INR",
                                                      "receipt": p["id"], "notes": {"pickup_id": p["id"], "email": user["email"]}})
    await db.pickups.update_one({"id": p["id"]}, {"$set": {"payment_method": "online", "payment_order_id": order["id"]}})
    return {"order_id": order["id"], "amount": order["amount"], "currency": "INR", "key_id": os.environ["RAZORPAY_KEY_ID"],
            "name": user.get("name", ""), "email": user["email"], "contact": user.get("phone", "")}


@api.post("/payments/razorpay/verify")
async def verify_payment(body: PaymentVerifyIn, user: dict = Depends(require(*CUSTOMER_ROLES))):
    p = await own_online_pickup(body.pickup_id, user)
    if p.get("payment_order_id") != body.razorpay_order_id:
        raise HTTPException(400, "Payment order mismatch")
    try:
        razorpay_client().utility.verify_payment_signature({"razorpay_order_id": body.razorpay_order_id,
                                                            "razorpay_payment_id": body.razorpay_payment_id, "razorpay_signature": body.razorpay_signature})
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(400, "Payment verification failed")
    await db.pickups.update_one({"id": p["id"]}, {"$set": {"payment_status": "paid", "payment_id": body.razorpay_payment_id, "paid_at": now_iso()},
                                                "$push": {"history": hist(p["status"], user, f"Online payment of ₹{p['service_fee']} received")}})
    return strip_otp(await db.pickups.find_one({"id": p["id"]}, NO_ID), user)


# ---------- Files (Local Base64 Fallback Storage) ----------
@api.post("/files/upload")
async def upload_file(category: str = Form(...), file: UploadFile = File(...), user: dict = Depends(current_user)):
    if category == "scrap":
        if user["role"] not in (*CUSTOMER_ROLES, "admin"):
            raise HTTPException(403, "Only customers can upload scrap photos")
    elif category in KYC_FILE_CATEGORIES.values():
        if user["role"] != "delivery_partner":
            raise HTTPException(403, "Only delivery partners can upload verification documents")
    else:
        raise HTTPException(400, "Invalid file category")
    
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_TYPES:
        raise HTTPException(400, "Only JPG, PNG, WEBP, HEIC or PDF files are allowed")
    
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(400, "File is larger than 5 MB")
    
    file_id = str(uuid.uuid4())
    encoded_data = base64.b64encode(data).decode('utf-8')
    
    doc = {
        "id": file_id,
        "storage_data": encoded_data,
        "original_filename": file.filename or "upload",
        "content_type": ctype,
        "size": len(data),
        "category": category,
        "owner_email": user["email"],
        "is_deleted": False,
        "created_at": now_iso()
    }
    await db.files.insert_one(doc)
    return {"id": file_id, "original_filename": file.filename, "content_type": ctype, "category": category, "size": len(data)}


@api.get("/files/{file_id}")
async def download_file(file_id: str, user: dict = Depends(current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, NO_ID)
    if not rec:
        raise HTTPException(404, "File not found")
    
    if "storage_data" in rec:
        data = base64.b64decode(rec["storage_data"])
        return Response(content=data, media_type=rec["content_type"])
    
    # Fallback to external storage if old record exists
    try:
        data, _ = await asyncio.to_thread(get_object, rec.get("storage_path", ""))
        return Response(content=data, media_type=rec["content_type"])
    except Exception:
        raise HTTPException(404, "File content not available")


# ---------- Delivery partner verification (KYC) ----------
@api.get("/kyc/me")
async def my_kyc(user: dict = Depends(require("delivery_partner"))):
    return user.get("kyc") or {"status": "not_submitted"}


@api.put("/kyc/me")
async def submit_kyc(body: KycSubmit, user: dict = Depends(require("delivery_partner"))):
    if (user.get("kyc") or {}).get("status") == "verified":
        raise HTTPException(400, "You are already verified. Contact your district admin to change details.")
    for field, category in KYC_FILE_CATEGORIES.items():
        if not await db.files.find_one({"id": getattr(body, field), "owner_email": user["email"], "category": category, "is_deleted": False}):
            raise HTTPException(400, f"Please upload your {category} again")
    kyc = {**body.model_dump(), "vehicle_number": body.vehicle_number.strip().upper(), "license_number": body.license_number.strip().upper(),
           "status": "pending", "submitted_at": now_iso(), "reviewed_by": None, "reviewed_at": None, "reject_reason": ""}
    await db.users.update_one({"email": user["email"]}, {"$set": {"kyc": kyc, "district": body.district.strip(), "phone": body.phone}})
    return kyc


@api.get("/admin/kyc")
async def list_kyc(user: dict = Depends(require("admin"))):
    partners = await db.users.find({"role": "delivery_partner", **district_filter(user)}, USER_PROJ).to_list(2000)
    for p in partners:
        p["kyc"] = p.get("kyc") or {"status": "not_submitted"}
    return partners


@api.put("/admin/kyc/{user_id}")
async def review_kyc(user_id: str, body: KycReview, user: dict = Depends(require("admin"))):
    target = await db.users.find_one({"id": user_id, "role": "delivery_partner"}, USER_PROJ)
    if not target or not in_scope(user, target.get("district", "")):
        raise HTTPException(404, "Partner not found")
    kyc = target.get("kyc") or {}
    if kyc.get("status") in (None, "not_submitted"):
        raise HTTPException(400, "This partner has not submitted documents yet")
    if body.action == "reject" and not (body.reason or "").strip():
        raise HTTPException(400, "Please give a reason for rejection")
    kyc.update({"status": "verified" if body.action == "approve" else "rejected", "reviewed_by": user["email"],
                "reviewed_at": now_iso(), "reject_reason": "" if body.action == "approve" else body.reason.strip()})
    await db.users.update_one({"id": user_id}, {"$set": {"kyc": kyc}})
    return await db.users.find_one({"id": user_id}, USER_PROJ)


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
    await db.files.create_index("id", unique=True)
    await db.users.update_many({"role": "admin", "admin_scope": {"$exists": False}}, {"$set": {"admin_scope": "All"}})
    await db.users.update_many({"role": "delivery_partner", "kyc": {"$exists": False}}, {"$set": {"kyc": {"status": "not_submitted"}}})
    async for p in db.pickups.find({"assigned_to": {"$ne": None}, "assigned_name": {"$exists": False}}, {"_id": 0, "id": 1, "assigned_to": 1}):
        partner = await db.users.find_one({"email": p["assigned_to"]}, USER_PROJ)
        if partner:
            await db.pickups.update_one({"id": p["id"]}, {"$set": assignee_fields(partner)})
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
    async for p in db.pickups.find({"items": {"$exists": False}}, NO_ID):
        await db.pickups.update_one({"id": p["id"]}, {"$set": {
            "items": [{"material": p["material"], "weight": p.get("weight", p["weight_kg"]), "unit": p.get("unit", "Kg"), "weight_kg": p["weight_kg"], "rate": p.get("rate", 0), "amount": p["amount"]}],
            "otp": f"{secrets.randbelow(10000):04d}", "payment_method": "cod", "service_fee": 0, "payment_status": "not_required"}})


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    await seed()
    logger.info("ReLoop seed complete")
    try:
        await asyncio.to_thread(init_storage)
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    
    yield
    
    # --- Shutdown ---
    print("App is shutting down...")

app = FastAPI(title="ReLoop API", lifespan=lifespan)

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)