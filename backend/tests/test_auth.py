"""Password sign-in: hashing, sign-up (the first admin, then pending), and the cookie flow through the real app."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import auth, repo


@pytest.fixture
def client(fresh_db):
    with TestClient(app) as c:
        yield c


def test_hash_is_salted_and_checks(fresh_db):
    a, b = auth.hash_password("secret"), auth.hash_password("secret")
    assert a != b and "secret" not in a
    assert auth.check_password("secret", a) and not auth.check_password("wrong", a)
    assert not auth.check_password("secret", "garbage")


def test_duplicate_username_or_email_refused(fresh_db):
    auth.add_user("sarah", "Sarah", "pw", "sarah@x.com")
    with pytest.raises(auth.AuthError, match="username"):
        auth.add_user("SARAH", "Other", "pw", "other@x.com")  # usernames are case-insensitive
    with pytest.raises(auth.AuthError, match="email"):
        auth.add_user("other", "Other", "pw", "Sarah@X.com")  # so are emails
    with pytest.raises(auth.AuthError, match="valid email"):
        auth.add_user("other", "Other", "pw", "not-an-email")


def test_login_me_logout(client):
    auth.add_user("sarah", "Sarah K", "pw1234", "sarah@x.com")
    assert client.get("/api/auth/me").json()["user"] is None

    bad = client.post("/api/auth/login", json={"username": "sarah", "password": "nope"})
    assert bad.status_code == 401

    ok = client.post("/api/auth/login", json={"username": "sarah", "password": "pw1234"})
    assert ok.status_code == 200 and ok.json()["user"]["displayName"] == "Sarah K"
    assert client.get("/api/auth/me").json()["user"]["username"] == "sarah"

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["user"] is None


def test_password_change_ends_sessions(client):
    auth.add_user("sarah", "Sarah", "pw1234", "sarah@x.com")
    client.post("/api/auth/login", json={"username": "sarah", "password": "pw1234"})
    assert repo.set_password("sarah", auth.hash_password("new"))
    assert client.get("/api/auth/me").json()["user"] is None


def test_register_first_admin_then_pending(client):
    ok = client.post("/api/auth/register", json={"username": "sarah", "email": "sarah@x.com",
                                                 "displayName": "Sarah K", "password": "pw1234"})
    assert ok.status_code == 200 and ok.json()["user"]["displayName"] == "Sarah K"
    me = client.get("/api/auth/me").json()["user"]
    assert (me["username"], me["role"], me["status"], me["notifyWorkOrders"]) == ("sarah", "admin", "active", True)

    next_one = client.post("/api/auth/register", json={"username": "ali", "email": "ali@x.com", "password": "pw1234"})
    assert (next_one.json()["user"]["role"], next_one.json()["user"]["status"]) == ("engineer", "pending")

    taken = client.post("/api/auth/register", json={"username": "Sarah", "email": "new@x.com", "password": "pw1234"})
    assert taken.status_code == 400
    no_email = client.post("/api/auth/register", json={"username": "new", "password": "pw1234"})
    assert no_email.status_code == 422
    short = client.post("/api/auth/register", json={"username": "new", "email": "new@x.com", "password": "pw"})
    assert short.status_code == 422
