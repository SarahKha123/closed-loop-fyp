"""The demo login: password hashing, the seeded account, and the cookie flow through the real app."""

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


def test_demo_user_seeded_once(fresh_db):
    auth.ensure_demo_user()
    auth.ensure_demo_user()
    assert repo.user_count() == 1


def test_duplicate_username_refused(fresh_db):
    auth.add_user("sarah", "Sarah", "pw")
    with pytest.raises(auth.AuthError):
        auth.add_user("SARAH", "Other", "pw")  # usernames are case-insensitive


def test_login_me_logout(client):
    assert client.get("/api/auth/me").json() == {"user": None}

    bad = client.post("/api/auth/login", json={"username": "demo", "password": "nope"})
    assert bad.status_code == 401

    ok = client.post("/api/auth/login", json={"username": "demo", "password": "demo"})
    assert ok.status_code == 200 and ok.json()["user"]["displayName"] == auth.DEMO_NAME
    assert client.get("/api/auth/me").json()["user"]["username"] == "demo"

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json() == {"user": None}


def test_password_change_ends_sessions(client):
    client.post("/api/auth/login", json={"username": "demo", "password": "demo"})
    assert repo.set_password("demo", auth.hash_password("new"))
    assert client.get("/api/auth/me").json() == {"user": None}
