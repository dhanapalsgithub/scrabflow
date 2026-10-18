"""Shared helpers for ReLoop API tests."""
import base64
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://reloop-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 PNG
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

CREDS = {
    "admin": ("dhanapaul2020@gmail.com", "dhana@123"),
    "public": ("test29@gmail.com", "public@123"),
    "corporate": ("test30@gmail.com", "cor@123"),
    "partner": ("test31@gmail.com", "partner@123"),
    "delivery_partner": ("test32@gmail.com", "delivery@123"),
}


def login(email, pw, role=None):
    r = requests.post(f"{API}/login", json={"email": email, "password": pw, "role": role}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def upload(token, category, content=PNG, ctype="image/png", name="TEST_img.png"):
    return requests.post(f"{API}/files/upload", headers=H(token), data={"category": category},
                         files={"file": (name, content, ctype)}, timeout=60)


def submit_kyc(token, vehicle="TN 01 AB 1234", district="Chennai"):
    ids = {}
    for cat in ("license", "photo", "selfie"):
        r = upload(token, cat)
        assert r.status_code == 200, r.text
        ids[f"{cat}_file_id"] = r.json()["id"]
    body = {"district": district, "phone": "+919876543210", "vehicle_type": "Bike", "vehicle_number": vehicle,
            "license_number": "TN0120200012345", **ids}
    return requests.put(f"{API}/kyc/me", headers=H(token), json=body, timeout=20)


def ensure_delivery_verified():
    """Make sure test32 is KYC verified (vehicle TN 01 AB 1234)."""
    d_token, _ = login(*CREDS["delivery_partner"])
    a_token, _ = login(*CREDS["admin"])
    k = requests.get(f"{API}/kyc/me", headers=H(d_token), timeout=20).json()
    if k.get("status") == "verified":
        return
    if k.get("status") != "pending":
        r = submit_kyc(d_token)
        assert r.status_code == 200, r.text
    me = requests.get(f"{API}/me", headers=H(d_token), timeout=20).json()
    r = requests.put(f"{API}/admin/kyc/{me['id']}", headers=H(a_token), json={"action": "approve"}, timeout=20)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="session")
def tokens():
    return {role: login(*CREDS[role], role) for role in CREDS}
