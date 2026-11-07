"""The API refuses anyone not signed in, each user's keys are their own and encrypted, and sign-in is guarded."""

import pytest
from fastapi.testclient import TestClient

from app.api.auth import current_user
from app.main import app
from app.services import cloud, db, model_config, repo


@pytest.fixture
def anonymous():
    app.dependency_overrides.pop(current_user, None)


def test_every_route_but_auth_and_health_needs_a_session(fresh_db, anonymous):
    with TestClient(app) as c:
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/auth/me").status_code == 200
        for method, path in [("get", "/api/cloud"), ("put", "/api/cloud/openai"), ("get", "/api/models/active"),
                             ("post", "/api/chat"), ("get", "/api/dashboard/overview"), ("post", "/api/replay/play"),
                             ("get", "/api/settings"), ("get", "/api/study")]:
            assert getattr(c, method)(path).status_code == 401, path


def test_keys_are_per_user_encrypted_and_never_returned(fresh_db, monkeypatch):
    monkeypatch.delenv("KEY_ENCRYPTION_SECRET", raising=False)
    alice = repo.insert_user("alice", "Alice", "x", "alice@x.com")["id"]
    bob = repo.insert_user("bob", "Bob", "x", "bob@x.com")["id"]
    cloud.save(alice, "groq", api_key="gsk-alice-secret-1234", model="m", base_url=None)

    with db.read() as conn:
        stored = conn.execute("SELECT ApiKeyEnc FROM tbl_UserCloud").fetchone()[0]
    assert "gsk-alice-secret-1234" not in stored  # encrypted at rest
    assert cloud.get(alice, "groq")["api_key"] == "gsk-alice-secret-1234"
    assert cloud.get(bob, "groq")["api_key"] == ""  # Bob can't see Alice's key
    assert all("gsk-alice-secret-1234" not in str(p) for p in cloud.public(alice))

    # Only the user's own key answers: there is no server key, so CLOUD_* in the environment does nothing.
    monkeypatch.setenv("CLOUD_PROVIDER", "groq")
    monkeypatch.setenv("CLOUD_API_KEY", "gsk-server-key-9999")
    monkeypatch.setenv("CLOUD_MODEL", "big")
    model_config.select(alice, "groq")
    model_config.select(bob, "groq")
    assert model_config.resolve(alice)["resolved"] is True
    assert model_config.resolve(bob)["resolved"] is False

    # A changed secret makes saved keys unreadable (no key), never a crash.
    monkeypatch.setenv("KEY_ENCRYPTION_SECRET", "another-secret")
    assert cloud.get(alice, "groq")["api_key"] == ""


def test_no_built_in_account_and_failed_logins_limited(fresh_db, anonymous):
    with TestClient(app) as c:
        assert repo.user_count() == 0  # no demo/demo: nobody has a known password
        codes = [c.post("/api/auth/login", json={"username": "x", "password": "y"}).status_code for _ in range(11)]
        assert codes[:10] == [401] * 10 and codes[10] == 429
