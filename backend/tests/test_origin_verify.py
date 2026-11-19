"""On AWS the API only answers requests that came through CloudFront (app/main.py OriginVerify)."""

from fastapi.testclient import TestClient

from app.main import app


def test_api_needs_cloudfronts_header_when_set(fresh_db, monkeypatch):
    c = TestClient(app)
    assert c.get("/api/auth/me").status_code != 403  # off without ORIGIN_VERIFY
    monkeypatch.setenv("ORIGIN_VERIFY", "s3cret")
    assert c.get("/api/auth/me").status_code == 403
    assert c.get("/api/auth/me", headers={"X-Origin-Verify": "wrong"}).status_code == 403
    assert c.get("/api/auth/me", headers={"X-Origin-Verify": "s3cret"}).status_code != 403
    assert c.get("/api/health").json()["status"] == "ok"  # the load balancer's health check needs no header
