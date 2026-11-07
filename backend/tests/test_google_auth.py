"""Google sign-in (OIDC code flow + PKCE) against a faked token endpoint, plus the session/audit rules
it shares with password sign-in: hashed tokens, expiry, one transaction, an audit row per event."""

from __future__ import annotations

import base64
import json
import sqlite3
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import auth, db, google_auth, repo

CLIENT_ID = "test-client.apps.googleusercontent.com"


def _jwt(claims: dict) -> str:
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()  # noqa: E731
    return f"{enc({'alg': 'RS256'})}.{enc(claims)}.sig"


@pytest.fixture
def google(fresh_db, monkeypatch):
    """Google configured, with a fake token endpoint whose ID token claims a test can tweak."""
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    monkeypatch.setenv("APP_URL", "http://localhost:5173")
    fake = {"claims": {}, "calls": []}

    def post(url, data, timeout):
        fake["calls"].append(data)
        claims = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "exp": time.time() + 600,
                  "sub": "1234567890", "email": "sarah@gmail.com", "email_verified": True, "name": "Sarah K",
                  "picture": "https://lh3.googleusercontent.com/a/x", "nonce": fake["nonce"], **fake["claims"]}
        return httpx.Response(200, json={"id_token": _jwt(claims)}, request=httpx.Request("POST", url))

    monkeypatch.setattr(google_auth.httpx, "post", post)
    with TestClient(app, follow_redirects=False) as c:
        yield c, fake


def _sign_in(c: TestClient, fake: dict, **query) -> httpx.Response:
    start = c.get("/api/auth/google")
    assert start.status_code == 302
    q = {k: v[0] for k, v in parse_qs(urlparse(start.headers["location"]).query).items()}
    fake["nonce"], fake["challenge"] = q["nonce"], q["code_challenge"]
    return c.get("/api/auth/google/callback", params={"code": "abc", "state": q["state"], **query})


def _events() -> list[str]:
    return [e["event"] + (f":{e['reason']}" if e["reason"] else "") for e in reversed(repo.auth_events())]


def test_start_redirects_to_google_with_pkce(google):
    c, _ = google
    res = c.get("/api/auth/google")
    url = urlparse(res.headers["location"])
    q = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert q["client_id"] == [CLIENT_ID] and q["scope"] == ["openid email profile"]
    assert q["redirect_uri"] == ["http://localhost:5173/api/auth/google/callback"]
    assert q["code_challenge_method"] == ["S256"]
    cookie = res.headers["set-cookie"]
    assert "google_flow=" in cookie and "HttpOnly" in cookie and "Path=/api/auth/google" in cookie and "Max-Age=600" in cookie


def test_sign_up_then_sign_in(google, fresh_db):
    c, fake = google
    res = _sign_in(c, fake)
    assert res.status_code == 302 and res.headers["location"] == "/"
    # PKCE: the verifier sent to Google hashes to the challenge sent earlier; the secret goes server to server
    sent = fake["calls"][-1]
    assert auth.sha256(sent["code_verifier"]) == fake["challenge"] and sent["client_secret"] == "secret"

    user = c.get("/api/auth/me").json()["user"]
    assert user["email"] == "sarah@gmail.com" and user["displayName"] == "Sarah K" and user["avatarUrl"]
    assert (user["role"], user["status"]) == ("admin", "active")  # nobody else yet: the first admin

    cookie = c.cookies[auth.COOKIE]
    with sqlite3.connect(fresh_db) as conn:
        [(stored,)] = conn.execute("SELECT Token FROM tbl_Session").fetchall()
    assert stored != cookie and stored == auth.sha256(cookie)  # only the hash is stored

    fake["claims"] = {"name": "Sarah Khalilah"}
    _sign_in(c, fake)
    assert repo.user_count() == 1  # matched on `sub`, not duplicated
    assert c.get("/api/auth/me").json()["user"]["displayName"] == "Sarah Khalilah"
    assert _events() == ["signup", "login", "login"]

    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").json()["user"] is None and _events()[-1] == "logout"


@pytest.mark.parametrize(("query", "claims", "reason"), [
    ({"error": "access_denied"}, {}, "cancelled"),
    ({"state": "forged"}, {}, "state"),
    ({}, {"nonce": "replayed"}, "token"),
    ({}, {"aud": "someone-else"}, "token"),
    ({}, {"email_verified": False}, "token"),
    ({}, {"exp": time.time() - 1}, "token"),
    ({}, {"iss": "https://evil.example"}, "token"),
])
def test_failures_redirect_and_are_audited(google, query, claims, reason):
    c, fake = google
    fake["claims"] = claims
    res = _sign_in(c, fake, **query)
    assert res.headers["location"] == f"/?authError={reason}"
    assert auth.COOKIE not in c.cookies and "google_flow=\"\"" in res.headers["set-cookie"]
    assert _events() == [f"login_failed:{reason}"] and repo.user_count() == 0


def test_exchange_failure(google, monkeypatch):
    c, fake = google
    monkeypatch.setattr(google_auth.httpx, "post", lambda url, **_: httpx.Response(
        400, text="invalid_client", request=httpx.Request("POST", url)))
    assert _sign_in(c, fake).headers["location"] == "/?authError=exchange"


def test_not_configured(fresh_db, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    with TestClient(app, follow_redirects=False) as c:
        assert c.get("/api/auth/me").json()["googleSignIn"] is False
        assert c.get("/api/auth/google").status_code == 404


def test_email_of_a_password_account_is_never_linked(google):
    c, fake = google
    auth.add_user("sarah", "Sarah", "pw1234", "sarah@gmail.com")
    assert _sign_in(c, fake).headers["location"] == "/?authError=exists"
    assert repo.user_count() == 1 and _events() == ["login_failed:exists"]


def test_disabled_google_account_is_refused(google):
    c, fake = google
    auth.add_user("boss", "Boss", "pw1234", "boss@x.com")  # the admin
    _sign_in(c, fake)
    sarah = c.get("/api/auth/me").json()["user"]
    assert sarah["status"] == "pending"
    repo.change_account(sarah["id"], {"id": 1}, (None, None), action="reject")
    assert _sign_in(c, fake).headers["location"] == "/?authError=disabled"


def test_password_sign_in_is_audited_and_sessions_expire(fresh_db, monkeypatch):
    auth.add_user("demo", "Demo", "demo", "demo@x.com")
    with TestClient(app) as c:
        c.post("/api/auth/login", json={"username": "demo", "password": "nope"})
        c.post("/api/auth/login", json={"username": "demo", "password": "demo"})
        assert _events() == ["login_failed:password", "login"]
        with sqlite3.connect(fresh_db) as conn:
            conn.execute("UPDATE tbl_Session SET ExpiresAt = '2000-01-01T00:00:00+00:00'")
        assert c.get("/api/auth/me").json()["user"] is None


def test_google_account_has_no_password(google):
    c, fake = google
    _sign_in(c, fake)
    assert auth.login("sarah@gmail.com", "") is None


def test_migrates_a_v1_database(tmp_path, monkeypatch):
    from app.services import paths
    monkeypatch.setattr(paths, "DB_PATH", tmp_path / "old.db")
    with sqlite3.connect(paths.DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE tbl_User (UserID INTEGER PRIMARY KEY, Username TEXT NOT NULL UNIQUE COLLATE NOCASE,
              DisplayName TEXT NOT NULL, PasswordHash TEXT NOT NULL, CreatedAt TEXT NOT NULL);
            CREATE TABLE tbl_Session (Token TEXT PRIMARY KEY, UserID INTEGER NOT NULL, CreatedAt TEXT NOT NULL);
            INSERT INTO tbl_User VALUES (1, 'sarah', 'Sarah', 'x', 'now');
            INSERT INTO tbl_Session VALUES ('raw-token', 1, 'now');
            PRAGMA user_version = 1;
        """)
    db.init_db()
    with sqlite3.connect(paths.DB_PATH) as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(tbl_User)")}
        assert {"GoogleSub", "Email", "AvatarURL", "LastLoginAt"} <= cols
        assert conn.execute("SELECT COUNT(*) FROM tbl_Session").fetchone()[0] == 0  # raw tokens dropped
        assert conn.execute("SELECT COUNT(*) FROM tbl_User").fetchone()[0] == 1  # accounts kept
        assert conn.execute("SELECT Role, Status FROM tbl_User").fetchone() == ("admin", "active")  # v4
        assert conn.execute("PRAGMA user_version").fetchone()[0] == db.SCHEMA_VERSION
