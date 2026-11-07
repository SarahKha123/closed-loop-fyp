"""Roles and approval through the real API: what pending, engineer and admin accounts may do, and the admin's actions."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.auth import current_user
from app.main import app
from app.services import auth, insights, repo


@pytest.fixture
def real_sessions(fresh_db):
    """No stand-in user: each client signs in for real."""
    app.dependency_overrides.pop(current_user, None)


def _client(username: str, password: str = "pw1234") -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": username, "password": password}).status_code == 200
    return c


def test_pending_engineer_and_admin(real_sessions):
    admin = auth.add_user("boss", "Boss", "pw1234", "boss@x.com")
    eng = auth.add_user("eng", "Eng", "pw1234", "eng@x.com")
    assert (admin["role"], admin["status"], eng["status"]) == ("admin", "active", "pending")

    e = _client("eng")
    assert e.get("/api/auth/me").json()["user"]["status"] == "pending"
    assert e.get("/api/dashboard/overview").status_code == 403  # waiting: nothing but /api/auth

    a = _client("boss")
    users = a.get("/api/admin/users").json()
    assert users["pendingCount"] == 1 and users["users"][0]["username"] == "eng"  # pending first
    r = a.post(f"/api/admin/users/{eng['id']}/approve").json()
    assert r["user"]["status"] == "active" and "Email isn't set up" in r["notice"]

    # An engineer uses the dashboard but can't run the place.
    assert e.get("/api/settings").status_code == 200
    assert e.put("/api/settings", json={"insights": {"enabled": False}}).status_code == 403
    assert e.get("/api/admin/users").status_code == 403
    assert e.get("/api/study").status_code == 403
    assert a.put("/api/settings", json={"insights": {"enabled": False}}).status_code == 200

    # Disabling ends their sessions at once, stops them driving the replay, and refuses their password.
    insights.drive(eng)
    a.post(f"/api/admin/users/{eng['id']}/disable")
    assert e.get("/api/auth/me").json()["user"] is None
    assert insights.status()["driver"] is None
    assert e.post("/api/auth/login", json={"username": "eng", "password": "pw1234"}).status_code == 403
    assert a.post(f"/api/admin/users/{eng['id']}/enable").json()["user"]["status"] == "active"


def test_the_last_admin_stays(real_sessions):
    admin = auth.add_user("boss", "Boss", "pw1234", "boss@x.com")
    a = _client("boss")
    for call in (lambda: a.put(f"/api/admin/users/{admin['id']}/role", json={"role": "engineer"}),
                 lambda: a.post(f"/api/admin/users/{admin['id']}/disable")):
        r = call()
        assert r.status_code == 400 and "only admin" in r.json()["detail"]

    # With a second admin, the first may step down; a role change is audited with who did it.
    other = auth.add_user("deputy", "Deputy", "pw1234", "deputy@x.com", role="admin", status="active")
    assert a.put(f"/api/admin/users/{admin['id']}/role", json={"role": "engineer"}).json()["user"]["role"] == "engineer"
    ev = repo.auth_events()[0]
    assert (ev["event"], ev["reason"], ev["userId"], ev["actorId"]) == ("role", "engineer", admin["id"], admin["id"])
    assert other["role"] == "admin"


def test_no_active_admin_means_the_next_sign_up_runs_it(real_sessions):
    old = auth.add_user("old", "Old", "pw1234", "old@x.com")
    repo.make_admin("old")
    with repo.db.write() as conn:  # e.g. the migrated demo account: an admin, switched off
        conn.execute("UPDATE tbl_User SET Status = 'disabled' WHERE UserID = ?", (old["id"],))
    assert auth.add_user("new", "New", "pw1234", "new@x.com")["role"] == "admin"


def test_server_status_never_shows_secrets(real_sessions, monkeypatch):
    monkeypatch.setenv("SMTP_USER", "closedloop@gmail.com")
    monkeypatch.setenv("SMTP_APP_PASSWORD", "abcd efgh ijkl mnop")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "GOCSPX-secret1")
    auth.add_user("boss", "Boss", "pw1234", "boss@x.com")
    out = _client("boss").get("/api/admin/server").json()
    assert out["email"] == {"sender": "closedloop@gmail.com", "configured": True}
    assert out["google"]["configured"] is True and out["google"]["redirectUri"].endswith("/api/auth/google/callback")
    assert "mnop" not in str(out) and "GOCSPX" not in str(out)


def test_profile(real_sessions):
    auth.add_user("boss", "Boss", "pw1234", "boss@x.com")
    auth.add_user("eng", "Eng", "pw1234", "eng@x.com", role="engineer", status="active")
    e = _client("eng")
    assert e.patch("/api/auth/me", json={"notifyWorkOrders": True}).json()["user"]["notifyWorkOrders"] is True
    assert repo.emails(work_orders=True) == ["boss@x.com", "eng@x.com"]
    assert e.patch("/api/auth/me", json={"email": "boss@x.com"}).status_code == 400  # someone else's
