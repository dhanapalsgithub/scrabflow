"""ReLoop iteration 3: multi-item pickups, custom scrap types, OTP completion, COD service fee, Razorpay config,
head/district admin scoping. Run serially: pytest backend/tests/test_reloop_iter3.py -n 0
"""
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

from conftest import API, CREDS, H, login, ensure_delivery_verified

ENV = dotenv_values("/app/backend/.env")
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
MAD = ("test_iter3_madurai@example.com", "madurai123")
DEFAULT_RATES = {"Mixed Paper": 12, "Plastics": 18, "E-Waste": 45, "Metals": 35}
S = {}


def J(t):
    return {**H(t), "Content-Type": "application/json"}


def items4():
    return [{"material": "Mixed Paper", "weight": 10, "unit": "Kg"}, {"material": "Plastics", "weight": 5, "unit": "Kg"},
            {"material": "E-Waste", "weight": 2, "unit": "Kg"}, {"material": "Metals", "weight": 0.01, "unit": "Tons"}]


def create(token, items=None, **kw):
    body = {"items": items4() if items is None else items, "district": "Chennai", "address": "TEST_ iter3 addr", "payment_method": "cod", **kw}
    return requests.post(f"{API}/scrap/pickups/create", headers=J(token), json=body, timeout=20)


def status(token, pid, st, **kw):
    return requests.put(f"{API}/scrap/pickups/{pid}/status", headers=J(token), json={"status": st, **kw}, timeout=20)


@pytest.fixture(scope="module", autouse=True)
def state():
    ensure_delivery_verified()
    S["admin"] = login(*CREDS["admin"])[0]
    S["public"] = login(*CREDS["public"])[0]
    S["dp"] = login(*CREDS["delivery_partner"])[0]
    S["partner"] = login(*CREDS["partner"])[0]
    requests.put(f"{API}/settings", headers=J(S["admin"]), json={"rates": DEFAULT_RATES, "service_fee": 25, "dispatch_mode": "open"}, timeout=20)
    yield
    requests.put(f"{API}/settings", headers=J(S["admin"]), json={"rates": DEFAULT_RATES, "service_fee": 25, "dispatch_mode": "open"}, timeout=20)
    mdb.pickups.delete_many({"address": {"$regex": "^TEST"}})
    mdb.users.delete_many({"email": MAD[0]})
    mdb.zones.delete_many({"zone_id": {"$regex": "^TEST"}})


# Multi-item pickups
class TestMultiItem:
    def test_create_four_items(self):
        r = create(S["public"])
        assert r.status_code == 200, r.text
        p = r.json()
        S["pid"], S["otp"] = p["id"], p["otp"]
        assert len(p["items"]) == 4
        assert p["material"] == "Mixed Paper + Plastics + E-Waste + Metals"
        assert p["weight_kg"] == 27.0
        assert p["amount"] == 10 * 12 + 5 * 18 + 2 * 45 + 10 * 35
        assert p["service_fee"] == 25 and p["payment_status"] == "pending" and p["payment_method"] == "cod"
        assert isinstance(p["otp"], str) and len(p["otp"]) == 4 and p["otp"].isdigit()

    def test_duplicate_and_unknown_rejected(self):
        assert create(S["public"], items=[{"material": "Plastics", "weight": 5}, {"material": "Plastics", "weight": 5}]).status_code == 400
        assert create(S["public"], items=[{"material": "Unobtanium", "weight": 50}]).status_code == 400
        assert create(S["public"], items=[]).status_code == 422

    def test_online_payment_rejected(self):
        r = create(S["public"], payment_method="online")
        assert r.status_code == 400 and "Cash on Delivery" in r.json()["detail"]

    def test_payments_config_and_order_disabled(self):
        r = requests.get(f"{API}/payments/config", headers=H(S["public"]), timeout=20)
        assert r.status_code == 200 and r.json()["online_enabled"] is False and r.json()["service_fee"] == 25
        r = requests.post(f"{API}/payments/razorpay/order", headers=J(S["public"]), json={"pickup_id": S["pid"]}, timeout=20)
        assert r.status_code == 503


# OTP visibility & completion
class TestOtp:
    def test_otp_visible_only_to_customer(self):
        c = requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S["public"]), timeout=20).json()
        assert c["otp"] == S["otp"]
        for who in ("admin", "dp", "partner"):
            rows = requests.get(f"{API}/scrap/pickups/all", headers=H(S[who]), timeout=20).json()
            assert all("otp" not in x for x in rows), who
        for who in ("admin", "dp"):
            d = requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S[who]), timeout=20).json()
            assert "otp" not in d, who
        summ = requests.get(f"{API}/scrap/dashboard/summary", headers=H(S["admin"]), timeout=20).json()
        assert all("otp" not in x for x in summ["recent"])

    def test_accept_progress_returns_no_otp(self):
        r = status(S["dp"], S["pid"], "Accepted")
        assert r.status_code == 200 and "otp" not in r.json()
        r = status(S["dp"], S["pid"], "In Progress")
        assert r.status_code == 200 and "otp" not in r.json()

    def test_wrong_otp_rejected(self):
        wrong = "0000" if S["otp"] != "0000" else "1111"
        r = status(S["dp"], S["pid"], "Completed", otp=wrong, cash_collected=True)
        assert r.status_code == 400 and "OTP" in r.json()["detail"]
        assert status(S["dp"], S["pid"], "Completed", cash_collected=True).status_code == 400

    def test_cod_requires_cash(self):
        r = status(S["dp"], S["pid"], "Completed", otp=S["otp"])
        assert r.status_code == 400 and "cash" in r.json()["detail"].lower()

    def test_complete_with_otp_and_cash(self):
        r = status(S["dp"], S["pid"], "Completed", otp=S["otp"], cash_collected=True)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "Completed" and p["payment_status"] == "paid" and p["otp_verified"] is True and "otp" not in p
        c = requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S["public"]), timeout=20).json()
        assert c["status"] == "Completed" and c["payment_status"] == "paid"

    def test_admin_completes_without_otp(self):
        pid = create(S["public"]).json()["id"]
        r = status(S["admin"], pid, "Completed")
        assert r.status_code == 200, r.text
        assert r.json()["otp_verified"] is False and "completed by admin" in r.json()["history"][-1]["note"]

    def test_assign_endpoint_does_not_leak_otp(self):
        pid = create(S["public"]).json()["id"]
        r = requests.put(f"{API}/scrap/pickups/{pid}/assign", headers=J(S["admin"]), json={"delivery_email": CREDS["delivery_partner"][0]}, timeout=20)
        assert r.status_code == 200, r.text
        assert "otp" not in r.json(), "assign response leaks customer OTP to admin"


# Custom scrap types
class TestScrapTypes:
    def test_add_type_visible_and_bookable(self):
        r = requests.put(f"{API}/settings", headers=J(S["admin"]), json={"rates": {**DEFAULT_RATES, "TEST_Glass": 7}}, timeout=20)
        assert r.status_code == 200 and r.json()["rates"]["TEST_Glass"] == 7
        pub = requests.get(f"{API}/settings", headers=H(S["public"]), timeout=20).json()
        assert "TEST_Glass" in pub["rates"]
        r = create(S["public"], items=[{"material": "TEST_Glass", "weight": 10, "unit": "Kg"}])
        assert r.status_code == 200 and r.json()["amount"] == 70
        mats = [m["material"] for m in requests.get(f"{API}/scrap/dashboard/summary", headers=H(S["admin"]), timeout=20).json()["by_material"]]
        assert "TEST_Glass" in mats

    def test_invalid_types(self):
        assert requests.put(f"{API}/settings", headers=J(S["admin"]), json={"rates": {}}, timeout=20).status_code == 400
        assert requests.put(f"{API}/settings", headers=J(S["admin"]), json={"rates": {"X": 5}}, timeout=20).status_code == 400
        assert requests.put(f"{API}/settings", headers=J(S["admin"]), json={"rates": {"Glass": -1}}, timeout=20).status_code == 400

    def test_restore_and_service_fee(self):
        r = requests.put(f"{API}/settings", headers=J(S["admin"]), json={"rates": DEFAULT_RATES, "service_fee": 0}, timeout=20)
        assert r.status_code == 200 and set(r.json()["rates"]) == set(DEFAULT_RATES) and r.json()["service_fee"] == 0
        p = create(S["public"], items=[{"material": "Plastics", "weight": 10}]).json()
        assert p["payment_status"] == "not_required"
        r = requests.put(f"{API}/settings", headers=J(S["admin"]), json={"service_fee": 25}, timeout=20)
        assert r.json()["service_fee"] == 25


# Head admin / district admin scope
class TestDistrictScope:
    def test_create_district_admin_and_invalid_scope(self):
        r = requests.post(f"{API}/admin/users", headers=J(S["admin"]), json={"email": MAD[0], "password": MAD[1], "name": "TEST_ Madurai", "role": "admin", "district": "Madurai", "admin_scope": "Madurai"}, timeout=20)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        S["mad_id"] = uid
        assert r.json()["admin_scope"] == "Madurai"
        assert requests.put(f"{API}/admin/users/{uid}", headers=J(S["admin"]), json={"admin_scope": "Atlantis"}, timeout=20).status_code == 400
        r = requests.put(f"{API}/admin/users/{uid}", headers=J(S["admin"]), json={"admin_scope": "Madurai"}, timeout=20)
        assert r.status_code == 200 and r.json()["admin_scope"] == "Madurai"
        S["mad"] = login(*MAD)[0]

    def test_district_admin_zones(self):
        zones = requests.get(f"{API}/zones", headers=H(S["mad"]), timeout=20).json()["zones"]
        assert all(z["city"].lower() == "madurai" for z in zones)
        body = {"zone_id": "TEST-MDU-1", "city": "Madurai", "assigned_hub": "TEST Hub", "households": 10, "daily_volume_kg": 5, "status": "Active"}
        assert requests.post(f"{API}/zones", headers=J(S["mad"]), json=body, timeout=20).status_code == 200
        assert requests.post(f"{API}/zones", headers=J(S["mad"]), json={**body, "zone_id": "TEST-CHN-X", "city": "Chennai"}, timeout=20).status_code == 403
        chennai = [z for z in requests.get(f"{API}/zones", headers=H(S["admin"]), timeout=20).json()["zones"] if z["city"] == "Chennai"]
        assert chennai
        zid = chennai[0]["zone_id"]
        assert requests.put(f"{API}/zones/{zid}", headers=J(S["mad"]), json={**chennai[0], "households": 1}, timeout=20).status_code in (403, 404)
        assert requests.delete(f"{API}/zones/{zid}", headers=H(S["mad"]), timeout=20).status_code in (403, 404)
        assert requests.put(f"{API}/zones/TEST-MDU-1", headers=J(S["mad"]), json={**body, "city": "Chennai"}, timeout=20).status_code == 403

    def test_district_admin_restrictions(self):
        assert requests.put(f"{API}/settings", headers=J(S["mad"]), json={"service_fee": 1}, timeout=20).status_code == 403
        users = requests.get(f"{API}/admin/users", headers=H(S["mad"]), timeout=20).json()
        assert all((u.get("district") or "").lower() == "madurai" for u in users)
        rows = requests.get(f"{API}/scrap/pickups/all", headers=H(S["mad"]), timeout=20).json()
        assert all(p["district"].lower() == "madurai" for p in rows)

    def test_district_assignment_for_user(self):
        corp = login(*CREDS["corporate"])[1]
        orig = corp.get("district") or "Coimbatore"
        r = requests.put(f"{API}/admin/users/{corp['id']}", headers=J(S["admin"]), json={"district": "Madurai"}, timeout=20)
        assert r.status_code == 200 and r.json()["district"] == "Madurai"
        r = requests.put(f"{API}/admin/users/{corp['id']}", headers=J(S["admin"]), json={"district": orig}, timeout=20)
        assert r.json()["district"] == orig
