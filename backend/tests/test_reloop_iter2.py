"""ReLoop iteration 2: scrap photos, KYC verification, timeline, admin assign, dispatch mode, district admins.
Run serially (shared state): pytest /app/backend/tests/test_reloop_api.py /app/backend/tests/test_reloop_iter2.py -n 0
"""
import os
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

from conftest import API, CREDS, PNG, H, login, upload, submit_kyc

ENV = dotenv_values("/app/backend/.env")
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
DP2 = ("test_dp2@example.com", "dp2pass123")
MADURAI_ADMIN = ("test_madurai_admin@example.com", "madurai123")
S = {}


def J(t):
    return {**H(t), "Content-Type": "application/json"}


def mk_pickup(token, district="Chennai", photo_ids=None, addr="TEST_ addr"):
    body = {"items": [{"material": "Plastics", "weight": 20, "unit": "Kg"}], "district": district, "address": addr, "photo_ids": photo_ids or []}
    return requests.post(f"{API}/scrap/pickups/create", headers=J(token), json=body, timeout=20)


@pytest.fixture(scope="module", autouse=True)
def setup_module_state():
    mdb.users.update_one({"email": CREDS["delivery_partner"][0]}, {"$set": {"kyc": {"status": "not_submitted"}}})
    S["admin"] = login(*CREDS["admin"])[0]
    S["public"] = login(*CREDS["public"])[0]
    S["corp"] = login(*CREDS["corporate"])[0]
    S["dp"], S["dp_user"] = login(*CREDS["delivery_partner"])
    requests.put(f"{API}/settings", headers=J(S["admin"]), json={"dispatch_mode": "open"}, timeout=20)
    yield
    # cleanup + restore
    requests.put(f"{API}/settings", headers=J(S["admin"]), json={"dispatch_mode": "open"}, timeout=20)
    mdb.pickups.delete_many({"address": {"$regex": "^TEST"}})  # also cleans iter1 "TEST ..." pickups
    mdb.users.delete_many({"email": {"$in": [DP2[0], MADURAI_ADMIN[0]]}})
    k = mdb.users.find_one({"email": CREDS["delivery_partner"][0]})["kyc"]
    assert k["status"] == "verified" and k["vehicle_number"] == "TN 01 AB 1234"


# ---------- Files / scrap photos ----------
class TestScrapPhotos:
    def test_upload_and_create_with_photo(self):
        r = upload(S["public"], "scrap")
        assert r.status_code == 200, r.text
        f = r.json()
        assert f["category"] == "scrap" and f["content_type"] == "image/png"
        r = mk_pickup(S["public"], photo_ids=[f["id"]])
        assert r.status_code == 200, r.text
        p = r.json()
        assert len(p["photos"]) == 1 and p["photos"][0]["id"] == f["id"]
        assert p["status"] == "Pending" and p["history"][0]["status"] == "Pending"
        S["pid"], S["photo"] = p["id"], f["id"]

    def test_photo_download_permissions(self):
        assert requests.get(f"{API}/files/{S['photo']}", headers=H(S["public"]), timeout=30).content == PNG
        assert requests.get(f"{API}/files/{S['photo']}", headers=H(S["admin"]), timeout=30).status_code == 200
        assert requests.get(f"{API}/files/{S['photo']}", headers=H(S["dp"]), timeout=30).status_code == 200
        assert requests.get(f"{API}/files/{S['photo']}", headers=H(S["corp"]), timeout=30).status_code == 404

    def test_invalid_photo_id_rejected(self):
        assert mk_pickup(S["public"], photo_ids=["nope"]).status_code == 400

    def test_other_users_photo_rejected(self):
        assert mk_pickup(S["corp"], photo_ids=[S["photo"]]).status_code == 400

    def test_bad_type_and_size(self):
        assert upload(S["public"], "scrap", b"hello", "text/plain", "a.txt").status_code == 400
        assert upload(S["public"], "scrap", b"0" * (5 * 1024 * 1024 + 10), "image/png").status_code == 400
        assert upload(S["public"], "bogus").status_code == 400

    def test_role_category_restrictions(self):
        assert upload(S["dp"], "scrap").status_code == 403
        assert upload(S["public"], "license").status_code == 403


# ---------- KYC ----------
class TestKyc:
    def test_unverified_cannot_accept(self):
        assert requests.get(f"{API}/kyc/me", headers=H(S["dp"]), timeout=20).json()["status"] == "not_submitted"
        r = requests.put(f"{API}/scrap/pickups/{S['pid']}/status", headers=J(S["dp"]), json={"status": "Accepted"}, timeout=20)
        assert r.status_code in (403, 404)

    def test_submit_missing_file_rejected(self):
        body = {"district": "Chennai", "phone": "+919876543210", "vehicle_type": "Bike", "vehicle_number": "TN01",
                "license_number": "TN012345", "license_file_id": "x", "photo_file_id": "y", "selfie_file_id": "z"}
        assert requests.put(f"{API}/kyc/me", headers=J(S["dp"]), json=body, timeout=20).status_code == 400

    def test_review_not_submitted_rejected(self):
        r = requests.put(f"{API}/admin/kyc/{S['dp_user']['id']}", headers=J(S["admin"]), json={"action": "approve"}, timeout=20)
        assert r.status_code == 400

    def test_submit_reject_resubmit_approve(self):
        r = submit_kyc(S["dp"], vehicle="tn 01 ab 1234")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending" and r.json()["vehicle_number"] == "TN 01 AB 1234"
        lst = requests.get(f"{API}/admin/kyc", headers=H(S["admin"]), timeout=20).json()
        me = next(p for p in lst if p["email"] == CREDS["delivery_partner"][0])
        assert me["kyc"]["status"] == "pending" and "password_hash" not in me
        # admin can view kyc docs
        assert requests.get(f"{API}/files/{me['kyc']['license_file_id']}", headers=H(S["admin"]), timeout=30).status_code == 200
        uid = S["dp_user"]["id"]
        assert requests.put(f"{API}/admin/kyc/{uid}", headers=J(S["admin"]), json={"action": "reject", "reason": " "}, timeout=20).status_code == 400
        r = requests.put(f"{API}/admin/kyc/{uid}", headers=J(S["admin"]), json={"action": "reject", "reason": "TEST_ blurry licence"}, timeout=20)
        assert r.status_code == 200 and r.json()["kyc"]["status"] == "rejected"
        k = requests.get(f"{API}/kyc/me", headers=H(S["dp"]), timeout=20).json()
        assert k["status"] == "rejected" and k["reject_reason"] == "TEST_ blurry licence"
        assert submit_kyc(S["dp"]).status_code == 200
        r = requests.put(f"{API}/admin/kyc/{uid}", headers=J(S["admin"]), json={"action": "approve"}, timeout=20)
        assert r.status_code == 200 and r.json()["kyc"]["status"] == "verified" and r.json()["kyc"]["reject_reason"] == ""
        assert submit_kyc(S["dp"]).status_code == 400  # already verified

    def test_partner_cannot_access_admin_kyc(self):
        assert requests.get(f"{API}/admin/kyc", headers=H(S["dp"]), timeout=20).status_code == 403


# ---------- Accept / timeline / second partner ----------
class TestDispatch:
    def test_verified_accept_and_timeline(self):
        r = requests.put(f"{API}/scrap/pickups/{S['pid']}/status", headers=J(S["dp"]), json={"status": "Accepted"}, timeout=20)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["assigned_to"] == CREDS["delivery_partner"][0] and p["assigned_vehicle"] == "TN 01 AB 1234"
        assert "Accepted by" in p["history"][-1]["note"] and "Vehicle TN 01 AB 1234" in p["history"][-1]["note"]
        c = requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S["public"]), timeout=20).json()
        assert [h["status"] for h in c["history"]] == ["Pending", "Accepted"] and c["photos"]

    def test_second_partner_cannot_change(self):
        r = requests.post(f"{API}/admin/users", headers=J(S["admin"]), json={"email": DP2[0], "password": DP2[1], "name": "TEST_ DP Two", "role": "delivery_partner", "district": "Chennai"}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["kyc"]["status"] == "not_submitted"
        S["dp2"], u = login(*DP2)
        assert submit_kyc(S["dp2"], vehicle="TN 09 ZZ 0001").status_code == 200
        assert requests.put(f"{API}/admin/kyc/{u['id']}", headers=J(S["admin"]), json={"action": "approve"}, timeout=20).status_code == 200
        r = requests.put(f"{API}/scrap/pickups/{S['pid']}/status", headers=J(S["dp2"]), json={"status": "In Progress"}, timeout=20)
        assert r.status_code in (403, 404)
        # dp2 cannot even view it
        assert requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S["dp2"]), timeout=20).status_code == 404

    def test_progress_complete(self):
        for st in ("In Progress", "Completed"):
            otp = requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S["public"]), timeout=20).json()["otp"]
            r = requests.put(f"{API}/scrap/pickups/{S['pid']}/status", headers=J(S["dp"]), json={"status": st, "otp": otp, "cash_collected": True}, timeout=20)
            assert r.status_code == 200 and r.json()["status"] == st
        c = requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S["public"]), timeout=20).json()
        assert [h["status"] for h in c["history"]] == ["Pending", "Accepted", "In Progress", "Completed"]
        assert c.get("settled_at")

    def test_admin_assign(self):
        partners = requests.get(f"{API}/admin/delivery-partners", headers=H(S["admin"]), timeout=20).json()
        emails = [p["email"] for p in partners]
        assert CREDS["delivery_partner"][0] in emails and DP2[0] in emails
        pid = mk_pickup(S["public"]).json()["id"]
        S["pid2"] = pid
        assert requests.put(f"{API}/scrap/pickups/{pid}/assign", headers=J(S["admin"]), json={"delivery_email": CREDS["public"][0]}, timeout=20).status_code == 400
        r = requests.put(f"{API}/scrap/pickups/{pid}/assign", headers=J(S["admin"]), json={"delivery_email": DP2[0]}, timeout=20)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "Accepted" and p["assigned_to"] == DP2[0] and "Assigned by admin to" in p["history"][-1]["note"]
        assert requests.put(f"{API}/scrap/pickups/{pid}/assign", headers=J(S["dp"]), json={"delivery_email": DP2[0]}, timeout=20).status_code == 403
        # reassign to test32
        r = requests.put(f"{API}/scrap/pickups/{pid}/assign", headers=J(S["admin"]), json={"delivery_email": CREDS["delivery_partner"][0]}, timeout=20)
        assert r.json()["assigned_to"] == CREDS["delivery_partner"][0]

    def test_admin_assign_mode(self):
        try:
            r = requests.put(f"{API}/settings", headers=J(S["admin"]), json={"dispatch_mode": "admin_assign"}, timeout=20)
            assert r.json()["dispatch_mode"] == "admin_assign"
            pid = mk_pickup(S["public"]).json()["id"]
            rows = requests.get(f"{API}/scrap/pickups/all", headers=H(S["dp"]), timeout=20).json()
            assert rows and all(x["assigned_to"] == CREDS["delivery_partner"][0] for x in rows)
            assert pid not in [x["id"] for x in rows]
            r = requests.put(f"{API}/scrap/pickups/{pid}/status", headers=J(S["dp"]), json={"status": "Accepted"}, timeout=20)
            assert r.status_code in (403, 404)
            r = requests.put(f"{API}/scrap/pickups/{pid}/assign", headers=J(S["admin"]), json={"delivery_email": CREDS["delivery_partner"][0]}, timeout=20)
            assert r.status_code == 200
        finally:
            r = requests.put(f"{API}/settings", headers=J(S["admin"]), json={"dispatch_mode": "open"}, timeout=20)
            assert r.json()["dispatch_mode"] == "open"

    def test_invalid_dispatch_mode(self):
        assert requests.put(f"{API}/settings", headers=J(S["admin"]), json={"dispatch_mode": "x"}, timeout=20).status_code == 422


# ---------- District admin ----------
class TestDistrictAdmin:
    def test_create_scoped_admin(self):
        r = requests.post(f"{API}/admin/users", headers=J(S["admin"]), json={"email": MADURAI_ADMIN[0], "password": MADURAI_ADMIN[1], "name": "TEST_ Madurai Admin", "role": "admin", "district": "Madurai", "admin_scope": "Madurai"}, timeout=20)
        assert r.status_code == 200 and r.json()["admin_scope"] == "Madurai"
        S["md"], S["md_user"] = login(*MADURAI_ADMIN, "admin")
        S["madurai_pid"] = mk_pickup(S["public"], district="Madurai").json()["id"]

    def test_scoped_visibility(self):
        rows = requests.get(f"{API}/scrap/pickups/all", headers=H(S["md"]), timeout=20).json()
        assert rows and all(p["district"].lower() == "madurai" for p in rows)
        assert S["madurai_pid"] in [p["id"] for p in rows]
        users = requests.get(f"{API}/admin/users", headers=H(S["md"]), timeout=20).json()
        assert all((u.get("district") or "").lower() == "madurai" for u in users)
        kyc = requests.get(f"{API}/admin/kyc", headers=H(S["md"]), timeout=20).json()
        assert all((u.get("district") or "").lower() == "madurai" for u in kyc)
        assert requests.get(f"{API}/scrap/pickups/{S['pid']}", headers=H(S["md"]), timeout=20).status_code == 404
        summ = requests.get(f"{API}/scrap/dashboard/summary", headers=H(S["md"]), timeout=20).json()
        assert all(p["district"].lower() == "madurai" for p in summ["recent"])
        comp = requests.get(f"{API}/compliance", headers=H(S["md"]), timeout=20).json()
        assert all(d["district"].lower() == "madurai" for d in comp["by_district"])

    def test_scoped_restrictions(self):
        assert requests.put(f"{API}/settings", headers=J(S["md"]), json={"platform_name": "X"}, timeout=20).status_code == 403
        r = requests.post(f"{API}/admin/users", headers=J(S["md"]), json={"email": "test_x_admin@example.com", "password": "abcdef1", "name": "TEST_ X", "role": "admin"}, timeout=20)
        assert r.status_code == 403
        assert requests.put(f"{API}/admin/kyc/{S['dp_user']['id']}", headers=J(S["md"]), json={"action": "reject", "reason": "x"}, timeout=20).status_code == 404
        assert requests.put(f"{API}/scrap/pickups/{S['pid2']}/assign", headers=J(S["md"]), json={"delivery_email": CREDS["delivery_partner"][0]}, timeout=20).status_code == 404
        # cannot assign Chennai partner? Madurai admin sees no Chennai partners
        partners = requests.get(f"{API}/admin/delivery-partners", headers=H(S["md"]), timeout=20).json()
        assert all(p["district"].lower() == "madurai" for p in partners)

    def test_delete_scoped_admin(self):
        r = requests.delete(f"{API}/admin/users/{S['md_user']['id']}", headers=H(S["admin"]), timeout=20)
        assert r.status_code == 200
        assert requests.post(f"{API}/login", json={"email": MADURAI_ADMIN[0], "password": MADURAI_ADMIN[1]}, timeout=20).status_code == 401
