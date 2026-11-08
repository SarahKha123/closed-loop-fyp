"""Email: which events send, to whom, what it says, how failures surface — against a fake SMTP server."""

from __future__ import annotations

import asyncio
import smtplib

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import auth, events, monitor, notify, repo, settings, work_orders
from tests.test_monitor import _cycle


class FakeSMTP:
    sent: list = []
    fail_login = False

    def __init__(self, host, port, timeout):
        assert (host, port) == ("smtp.gmail.com", 587)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context):
        self.tls = True

    def login(self, user, password):
        assert self.tls and password == "abcdefghijklmnop"  # spaces from Google's display are stripped
        if FakeSMTP.fail_login:
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials")

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)


@pytest.fixture
def smtp(fresh_db, monkeypatch):
    monkeypatch.setenv("SMTP_USER", "closedloop@gmail.com")
    monkeypatch.setenv("SMTP_APP_PASSWORD", "abcd efgh ijkl mnop")
    auth.add_user("a", "A", "pw1234", "a@x.com")  # the first admin: work-order emails on
    b = auth.add_user("b", "B", "pw1234", "b@y.com", role="engineer", status="active")
    repo.update_profile(b["id"], notify_work_orders=True)
    auth.add_user("c", "C", "pw1234", "c@z.com", role="engineer", status="active")  # didn't ask for them
    monkeypatch.delenv("APP_URL", raising=False)
    monkeypatch.setattr(notify.smtplib, "SMTP", FakeSMTP)
    FakeSMTP.sent, FakeSMTP.fail_login = [], False
    return FakeSMTP.sent


def _opened(wo: dict) -> dict:
    return {"type": "work_order", "action": "opened", "workOrder": wo}


def test_only_new_work_orders_while_enabled(smtp):
    wo = work_orders.open_manual("valve", "check seals")
    assert notify.should_send(_opened(wo))
    assert not notify.should_send({**_opened(wo), "action": "closed"})
    assert not notify.should_send({"type": "prediction"})
    settings.update({"notifications": {"email": False}})
    assert not notify.should_send(_opened(wo))
    settings.update({"notifications": {"email": True}, "study": {"enabled": True}})
    assert not notify.should_send(_opened(wo))  # never in study mode


def test_not_configured(fresh_db, monkeypatch):
    monkeypatch.setenv("SMTP_USER", "closedloop@gmail.com")
    monkeypatch.delenv("SMTP_APP_PASSWORD", raising=False)
    wo = work_orders.open_manual("valve")
    assert not notify.should_send(_opened(wo)) and not notify.configured()
    with pytest.raises(notify.NotifyError, match="isn't set up"):
        notify.send_test("a@x.com")


def test_email_for_an_automatic_work_order(smtp, monkeypatch):
    [wo] = monitor.handle(_cycle(600, {"valve": "Critical"}))
    msg = notify.compose(wo)
    assert msg["Subject"] == f"[Closed Loop] High priority: Valve predicted Critical ({wo['id']})"
    body = msg.get_content()
    assert "cycle 600" in body and "top driver Volume flow 2 (mean)" in body and "/work-orders" not in body

    monkeypatch.setenv("APP_URL", "https://closedloop.example/")
    assert "Open the work orders: https://closedloop.example/work-orders" in notify.compose(wo).get_content()

    notify.send(msg, repo.emails(work_orders=True))
    [sent] = smtp
    assert sent["Bcc"] == "a@x.com, b@y.com" and sent["From"] == "Closed Loop <closedloop@gmail.com>"


def test_worker_emails_each_opened_work_order(smtp):
    async def scenario():
        events.bind(asyncio.get_running_loop())
        task = asyncio.create_task(notify.run())
        await asyncio.sleep(0)  # let it subscribe
        wo = work_orders.open_manual("pump", "noisy")
        work_orders.close(wo["id"], finding="ok", action="no_action", matched_prediction="no")  # no email
        for _ in range(100):
            if smtp:
                break
            await asyncio.sleep(0.02)
        await asyncio.sleep(0.1)
        task.cancel()
        events.bind(None)
        return wo

    wo = asyncio.run(scenario())
    assert [m["Subject"] for m in smtp] == [f"[Closed Loop] High priority: Pump work order raised ({wo['id']})"]


def test_sign_up_and_decision_emails(smtp):
    import threading
    pending = auth.add_user("d", "Dee", "pw1234", "d@w.com")
    notify.signed_up(pending)
    for t in threading.enumerate():
        if t.name == "notify-signup":
            t.join()
    assert smtp[-1]["Bcc"] == "a@x.com" and "Dee is waiting for approval" in smtp[-1]["Subject"]  # admins only
    assert notify.decided(pending, approved=True) is None
    assert smtp[-1]["Bcc"] == "d@w.com" and smtp[-1]["Subject"] == "[Closed Loop] Your account was approved"


def test_api_status_and_test_email(smtp):
    with TestClient(app) as c:
        st = c.get("/api/admin/server").json()["email"]
        assert st == {"sender": "closedloop@gmail.com", "configured": True}  # never the password
        assert c.post("/api/admin/email/test").json() == {"sent": True, "to": "tester@example.com"}
        assert smtp[-1]["Subject"] == "[Closed Loop] Test email"

        FakeSMTP.fail_login = True
        bad = c.post("/api/admin/email/test")
        assert bad.status_code == 400 and "App Password" in bad.json()["detail"]


def test_brevo_when_its_key_is_set(fresh_db, monkeypatch):
    """With BREVO_API_KEY the email goes over HTTPS (Render's free plan blocks SMTP), Bcc like the SMTP path."""
    import httpx

    monkeypatch.setenv("SMTP_USER", "closedloop@gmail.com")
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test")
    assert notify.configured()  # no App Password needed
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append((url, json, headers))
        return httpx.Response(201 if len(calls) == 1 else 401, json={"message": "Key not found"})

    monkeypatch.setattr(notify.httpx, "post", fake_post)
    monkeypatch.setattr(notify.smtplib, "SMTP", None)  # SMTP must not be used
    notify.send_test("a@x.com")
    url, body, headers = calls[0]
    assert url == notify.BREVO_URL and headers == {"api-key": "xkeysib-test"}
    assert body["sender"]["email"] == "closedloop@gmail.com" and body["bcc"] == [{"email": "a@x.com"}]
    assert body["subject"] == "[Closed Loop] Test email" and "works" in body["textContent"]
    with pytest.raises(notify.NotifyError, match="Brevo refused the email \\(401\\): Key not found"):
        notify.send_test("a@x.com")
