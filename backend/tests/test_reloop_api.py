"""ReLoop API tests - covers auth, pickups, zones, settings, admin users, compliance."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://reloop-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("dhanapaul2020@gmail.com", "dhana@123"),
    "public": ("test29@gmail.com", "public@123"),
    "corporate": ("test30@gmail.com", "cor@123"),
    "partner": ("test31@gmail.com", "partner@123"),
    "delivery_partner": ("test32@gmail.com", "delivery@123"),
}


def _login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{API}/login", json={"email": email, "password": pw, "role": role}, timeout=15)
    assert r.status_code == 200, f"login {role}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["role"] == role
    return data["token"], data["user"]


@pytest.fixture(scope="session")
def tokens():
    from conftest import ensure_delivery_verified
    ensure_delivery_verified()  # iteration 2: delivery partner must be KYC verified to handle pickups
    return {role: _login(role) for role in CREDS}


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_role_mismatch(self):
        r = requests.post(f"{API}/login", json={"email": CREDS["admin"][0], "password": CREDS["admin"][1], "role": "public"}, timeout=15)
        assert r.status_code == 401

    def test_login_invalid_password(self):
        # Use a unique email to avoid lockout on real accounts
        r = requests.post(f"{API}/login", json={"email": f"nouser-{uuid.uuid4().hex[:6]}@x.com", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, tokens):
        token, _ = tokens["admin"]
        r = requests.get(f"{API}/me", headers=H(token), timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
        assert "password_hash" not in r.json()

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/me", timeout=15)
        assert r.status_code == 401


# ---------- Pickups ----------
class TestPickups:
    def test_public_create_and_list(self, tokens):
        token, _ = tokens["public"]
        payload = {"material": "Plastics", "weight": 10, "unit": "Kg",
                   "district": "Chennai", "address": "TEST address 1", "phone": "9999999999",
                   "preferred_date": "", "notes": "TEST"}
        r = requests.post(f"{API}/scrap/pickups/create", headers=H(token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["amount"] == 180.0  # 10 kg * 18
        assert p["weight_kg"] == 10
        assert p["status"] == "Pending"
        assert p["customer_email"] == CREDS["public"][0]
        pytest.pickup_id = p["id"]

        # list - should see it
        r = requests.get(f"{API}/scrap/pickups/all", headers=H(token), timeout=15)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.pickup_id in ids

    def test_tons_multiplication(self, tokens):
        token, _ = tokens["corporate"]
        payload = {"material": "Metals", "weight": 0.5, "unit": "Tons",
                   "district": "Coimbatore", "address": "TEST tons addr"}
        r = requests.post(f"{API}/scrap/pickups/create", headers=H(token), json=payload, timeout=15)
        assert r.status_code == 200
        p = r.json()
        assert p["weight_kg"] == 500
        assert p["amount"] == 500 * 35
        pytest.corp_pickup_id = p["id"]

    def test_min_weight_rejected(self, tokens):
        token, _ = tokens["public"]
        payload = {"material": "Plastics", "weight": 1, "unit": "Kg",
                   "district": "Chennai", "address": "TEST too small"}
        r = requests.post(f"{API}/scrap/pickups/create", headers=H(token), json=payload, timeout=15)
        assert r.status_code == 400

    def test_delivery_accept_and_progress(self, tokens):
        d_token, _ = tokens["delivery_partner"]
        pid = pytest.pickup_id
        r = requests.put(f"{API}/scrap/pickups/{pid}/status", headers=H(d_token), json={"status": "Accepted"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Accepted"
        assert r.json()["assigned_to"] == CREDS["delivery_partner"][0]

        r = requests.put(f"{API}/scrap/pickups/{pid}/status", headers=H(d_token), json={"status": "In Progress"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "In Progress"

    def test_customer_cannot_cancel_non_pending(self, tokens):
        token, _ = tokens["public"]
        pid = pytest.pickup_id  # In Progress now
        r = requests.put(f"{API}/scrap/pickups/{pid}/status", headers=H(token), json={"status": "Cancelled"}, timeout=15)
        assert r.status_code == 400

    def test_customer_can_cancel_pending(self, tokens):
        token, _ = tokens["public"]
        payload = {"material": "Mixed Paper", "weight": 10, "unit": "Kg",
                   "district": "Chennai", "address": "TEST cancellable"}
        r = requests.post(f"{API}/scrap/pickups/create", headers=H(token), json=payload, timeout=15)
        pid = r.json()["id"]
        pytest.cancel_pid = pid
        r = requests.put(f"{API}/scrap/pickups/{pid}/status", headers=H(token), json={"status": "Cancelled"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "Cancelled"

    def test_delivery_cannot_update_completed(self, tokens):
        d_token, _ = tokens["delivery_partner"]
        pid = pytest.pickup_id
        # complete it
        r = requests.put(f"{API}/scrap/pickups/{pid}/status", headers=H(d_token), json={"status": "Completed"}, timeout=15)
        assert r.status_code == 200
        # Try again
        r = requests.put(f"{API}/scrap/pickups/{pid}/status", headers=H(d_token), json={"status": "Accepted"}, timeout=15)
        assert r.status_code == 400

    def test_delivery_cannot_create_pickup(self, tokens):
        token, _ = tokens["delivery_partner"]
        payload = {"material": "Plastics", "weight": 10, "unit": "Kg", "district": "Chennai", "address": "TEST"}
        r = requests.post(f"{API}/scrap/pickups/create", headers=H(token), json=payload, timeout=15)
        assert r.status_code == 403

    def test_dashboard_summary(self, tokens):
        for role in ["admin", "public", "corporate", "partner", "delivery_partner"]:
            token, _ = tokens[role]
            r = requests.get(f"{API}/scrap/dashboard/summary", headers=H(token), timeout=15)
            assert r.status_code == 200, f"{role}: {r.text}"
            data = r.json()
            assert data["role"] == role
            assert len(data["cards"]) == 4


# ---------- Zones ----------
class TestZones:
    def test_list_zones_partner(self, tokens):
        token, _ = tokens["partner"]
        r = requests.get(f"{API}/zones", headers=H(token), timeout=15)
        assert r.status_code == 200
        assert "zones" in r.json() and "metrics" in r.json()

    def test_public_cannot_list_zones(self, tokens):
        token, _ = tokens["public"]
        r = requests.get(f"{API}/zones", headers=H(token), timeout=15)
        assert r.status_code == 403

    def test_zone_crud(self, tokens):
        token, _ = tokens["partner"]
        zid = f"TEST-Z-{uuid.uuid4().hex[:4]}"
        body = {"zone_id": zid, "city": "Salem", "assigned_hub": "TEST Hub", "households": 100, "daily_volume_kg": 50, "status": "Active"}
        r = requests.post(f"{API}/zones", headers=H(token), json=body, timeout=15)
        assert r.status_code == 200
        assert r.json()["zone_id"] == zid

        # Update
        body["households"] = 200
        r = requests.put(f"{API}/zones/{zid}", headers=H(token), json=body, timeout=15)
        assert r.status_code == 200
        assert r.json()["households"] == 200

        # Delete
        r = requests.delete(f"{API}/zones/{zid}", headers=H(token), timeout=15)
        assert r.status_code == 200
        r = requests.delete(f"{API}/zones/{zid}", headers=H(token), timeout=15)
        assert r.status_code == 404


# ---------- Settings ----------
class TestSettings:
    def test_read_settings(self, tokens):
        token, _ = tokens["admin"]
        r = requests.get(f"{API}/settings", headers=H(token), timeout=15)
        assert r.status_code == 200
        assert "rates" in r.json()

    def test_rate_change_reflected_in_new_pickup(self, tokens):
        a_token, _ = tokens["admin"]
        # Save original
        orig = requests.get(f"{API}/settings", headers=H(a_token), timeout=15).json()
        new_rates = {**orig["rates"], "Plastics": 25}
        r = requests.put(f"{API}/settings", headers=H(a_token), json={"rates": new_rates}, timeout=15)
        assert r.status_code == 200
        assert r.json()["rates"]["Plastics"] == 25

        # Create pickup as public, verify new rate
        p_token, _ = tokens["public"]
        payload = {"material": "Plastics", "weight": 10, "unit": "Kg", "district": "Chennai", "address": "TEST rate check"}
        r = requests.post(f"{API}/scrap/pickups/create", headers=H(p_token), json=payload, timeout=15)
        assert r.status_code == 200
        assert r.json()["rate"] == 25
        assert r.json()["amount"] == 250
        pytest.rate_check_pid = r.json()["id"]

        # Restore
        r = requests.put(f"{API}/settings", headers=H(a_token), json={"rates": orig["rates"]}, timeout=15)
        assert r.status_code == 200
        assert r.json()["rates"]["Plastics"] == orig["rates"]["Plastics"]

    def test_non_admin_cannot_update_settings(self, tokens):
        token, _ = tokens["public"]
        r = requests.put(f"{API}/settings", headers=H(token), json={"platform_name": "X"}, timeout=15)
        assert r.status_code == 403


# ---------- Admin users ----------
class TestAdminUsers:
    def test_list_users(self, tokens):
        token, _ = tokens["admin"]
        r = requests.get(f"{API}/admin/users", headers=H(token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert all("password_hash" not in u for u in r.json())

    def test_user_crud_and_deactivate(self, tokens):
        a_token, _ = tokens["admin"]
        email = f"test_user_{uuid.uuid4().hex[:6]}@example.com"
        body = {"email": email, "password": "secret123", "name": "TEST User", "role": "public", "district": "Chennai"}
        r = requests.post(f"{API}/admin/users", headers=H(a_token), json=body, timeout=15)
        assert r.status_code == 200
        uid = r.json()["id"]
        assert r.json()["email"] == email

        # Login works
        r = requests.post(f"{API}/login", json={"email": email, "password": "secret123"}, timeout=15)
        assert r.status_code == 200

        # Change role
        r = requests.put(f"{API}/admin/users/{uid}", headers=H(a_token), json={"role": "corporate"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "corporate"

        # Deactivate
        r = requests.put(f"{API}/admin/users/{uid}", headers=H(a_token), json={"active": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["active"] is False

        # Login blocked
        r = requests.post(f"{API}/login", json={"email": email, "password": "secret123"}, timeout=15)
        assert r.status_code == 403

        # Delete
        r = requests.delete(f"{API}/admin/users/{uid}", headers=H(a_token), timeout=15)
        assert r.status_code == 200

    def test_non_admin_cannot_list_users(self, tokens):
        token, _ = tokens["partner"]
        r = requests.get(f"{API}/admin/users", headers=H(token), timeout=15)
        assert r.status_code == 403


# ---------- Compliance ----------
class TestCompliance:
    def test_compliance_admin(self, tokens):
        token, _ = tokens["admin"]
        r = requests.get(f"{API}/compliance", headers=H(token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "summary" in data and "by_material" in data and "certificates" in data

    def test_compliance_corporate(self, tokens):
        token, _ = tokens["corporate"]
        r = requests.get(f"{API}/compliance", headers=H(token), timeout=15)
        assert r.status_code == 200

    def test_compliance_public_forbidden(self, tokens):
        token, _ = tokens["public"]
        r = requests.get(f"{API}/compliance", headers=H(token), timeout=15)
        assert r.status_code == 403


# ---------- Profile ----------
class TestProfile:
    def test_update_profile(self, tokens):
        token, user = tokens["partner"]
        orig_phone = user.get("phone", "")
        r = requests.put(f"{API}/me", headers=H(token), json={"phone": "9876543210"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["phone"] == "9876543210"
        # restore
        requests.put(f"{API}/me", headers=H(token), json={"phone": orig_phone}, timeout=15)

    def test_change_password_and_restore(self, tokens):
        token, _ = tokens["partner"]
        orig = CREDS["partner"][1]
        new = "newpw_TEST_123"
        r = requests.put(f"{API}/me/password", headers=H(token), json={"current_password": orig, "new_password": new}, timeout=15)
        assert r.status_code == 200
        # login with new password
        r = requests.post(f"{API}/login", json={"email": CREDS["partner"][0], "password": new}, timeout=15)
        assert r.status_code == 200
        new_token = r.json()["token"]
        # restore
        r = requests.put(f"{API}/me/password", headers=H(new_token), json={"current_password": new, "new_password": orig}, timeout=15)
        assert r.status_code == 200

    def test_wrong_current_password_rejected(self, tokens):
        token, _ = tokens["public"]
        r = requests.put(f"{API}/me/password", headers=H(token), json={"current_password": "wrongwrong", "new_password": "something123"}, timeout=15)
        assert r.status_code == 400


# ---------- Cleanup ----------
@pytest.fixture(scope="session", autouse=True)
def cleanup(tokens):
    yield
    # Nothing to delete explicitly; TEST_ pickups remain in DB. We clean up our rate_check pickup.
    try:
        a_token, _ = tokens["admin"]
        # No DELETE endpoint for pickups, leave them.
    except Exception:
        pass
