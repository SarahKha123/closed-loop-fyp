"""Email: work orders that open, new sign-ups for the admins, and approval decisions for the applicant.

Sent through Brevo's HTTPS API when BREVO_API_KEY is set (Render's free plan blocks outbound SMTP),
otherwise through Gmail's SMTP server with an App Password (SMTP_APP_PASSWORD). The sender address
is SMTP_USER either way (for Brevo, a sender verified in Brevo). Recipients are accounts, never a
fixed list:

    work order opened    every active user with "Email me when a work order opens" on (their own switch)
    someone signed up    every active admin
    approved / rejected  the applicant

Rules (docs/API.md: Notifications):
- Every work order that opens, automatic or manual. Closing one sends nothing.
- Work-order emails are muted by the `notifications.email` setting, and always in study mode.
- One email per work order: the monitor opens at most one automatic work order per component until a
  technician closes it, so a fast replay can't flood the inbox.
- A failed send is logged and dropped. The work order, sign-up or approval itself is never affected.

`run()` listens on the event bus like the other workers; the slow SMTP call runs off the event loop.
"""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
import ssl
import threading
from email.message import EmailMessage
from typing import Any

import httpx

from . import events, repo, settings, work_orders

log = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587  # STARTTLS
BREVO_URL = "https://api.brevo.com/v3/smtp/email"
SUBJECT_PREFIX = "[Closed Loop]"


class NotifyError(RuntimeError):
    """Email isn't set up, or the SMTP server refused (the message says which)."""


def _sender() -> tuple[str, str]:
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_APP_PASSWORD", "").replace(" ", "")  # Google shows it in groups of four
    return user, password


def _brevo_key() -> str:
    return os.environ.get("BREVO_API_KEY", "").strip()


def configured() -> bool:
    user, password = _sender()
    return bool(user and (password or _brevo_key()))


def should_send(event: dict[str, Any]) -> bool:
    if event.get("type") != "work_order" or event.get("action") != "opened":
        return False
    s = settings.get()
    return bool(s["notifications"]["email"]) and not s["study"]["enabled"] and configured()


def compose(wo: dict[str, Any]) -> EmailMessage:
    automatic = wo["createdBy"] == work_orders.SYSTEM
    reason = "predicted Critical" if automatic else "work order raised"
    lines = [
        f"{wo['priority']} priority work order {wo['id']} is open.",
        "",
        f"Component:  {wo['component']} ({wo['equipmentId']})",
        f"Raised by:  {'the monitor, from a Critical prediction' if automatic else 'a user'}",
    ]
    if wo.get("triggeredByCycle") is not None:
        lines.append(f"Prediction: cycle {wo['triggeredByCycle']}")
    lines.append(f"Opened:     {wo['createdAt']}")
    if wo.get("note"):
        lines += ["", wo["note"]]
    app_url = os.environ.get("APP_URL", "").strip().rstrip("/")
    if app_url:
        lines += ["", f"Open the work orders: {app_url}/work-orders"]
    lines += ["", "— Closed Loop predictive maintenance. Turn these off in your profile menu: Email me when a work order opens."]

    msg = EmailMessage()
    msg["Subject"] = f"{SUBJECT_PREFIX} {wo['priority']} priority: {wo['component']} {reason} ({wo['id']})"
    msg.set_content("\n".join(lines))
    return msg


def send(msg: EmailMessage, to: list[str]) -> None:
    """Send to `to`, each address in Bcc so recipients don't see each other. Blocking: call it off the event loop."""
    user, password = _sender()
    if not configured():
        raise NotifyError("email isn't set up: add SMTP_USER and BREVO_API_KEY (or SMTP_APP_PASSWORD) to .env, then restart")
    if not to:
        raise NotifyError("nobody to send to")
    if _brevo_key():
        _send_brevo(msg, user, to)
        return
    msg["From"], msg["To"], msg["Bcc"] = f"Closed Loop <{user}>", f"Closed Loop <{user}>", ", ".join(to)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            try:
                smtp.login(user, password)
            except smtplib.SMTPException as exc:
                # A wrong password answers 535, but an unknown account just gets disconnected: same advice for both.
                raise NotifyError(
                    f"Gmail refused the login ({exc}): check SMTP_USER and that SMTP_APP_PASSWORD is an App Password"
                ) from exc
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        raise NotifyError(f"could not send: {exc}") from exc


def _send_brevo(msg: EmailMessage, user: str, to: list[str]) -> None:
    """The same email through Brevo's API: to the sender, everyone else in Bcc."""
    body = {
        "sender": {"name": "Closed Loop", "email": user},
        "to": [{"email": user, "name": "Closed Loop"}],
        "bcc": [{"email": a} for a in to],
        "subject": msg["Subject"],
        "textContent": msg.get_content(),
    }
    try:
        res = httpx.post(BREVO_URL, json=body, headers={"api-key": _brevo_key()}, timeout=15)
    except httpx.HTTPError as exc:
        raise NotifyError(f"could not reach Brevo: {exc}") from exc
    if res.status_code >= 400:
        try:
            why = res.json().get("message", res.text)
        except ValueError:
            why = res.text
        raise NotifyError(f"Brevo refused the email ({res.status_code}): {why}")


def _plain(subject: str, *lines: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = f"{SUBJECT_PREFIX} {subject}"
    msg.set_content("\n".join(lines))
    return msg


def _link(path: str) -> list[str]:
    app_url = os.environ.get("APP_URL", "").strip().rstrip("/")
    return ["", f"{app_url}{path}"] if app_url else []


def send_test(to: str) -> None:
    send(_plain("Test email", "Email from Closed Loop works. Work orders, sign-ups and approvals will arrive like this."), [to])


def signed_up(user: dict[str, Any]) -> None:
    """Tell every active admin someone is waiting. Runs in a thread: sign-up never waits for Gmail."""
    if not configured():
        return

    def go() -> None:
        who = f"{user['displayName']} ({user['email'] or user['username']})"
        try:
            send(_plain(f"{user['displayName']} is waiting for approval",
                        f"{who} signed up and is waiting for approval.", "",
                        "Approve or reject them on the Admin page.", *_link("/admin")),
                 repo.emails(admins=True))
        except NotifyError:
            log.warning("notify: no sign-up email for %s", user["username"], exc_info=True)

    threading.Thread(target=go, name="notify-signup", daemon=True).start()


def decided(user: dict[str, Any], approved: bool) -> str | None:
    """Tell the applicant. Returns why they weren't told (no email set up, no address, a failed send), or None."""
    if not configured():
        return "Email isn't set up, so they weren't told. Let them know yourself."
    if not user["email"]:
        return "Their account has no email address, so they weren't told. Let them know yourself."
    if approved:
        msg = _plain("Your account was approved", f"Hi {user['displayName']},", "",
                     "An administrator approved your Closed Loop account. You can sign in now.", *_link("/"))
    else:
        msg = _plain("Your account was not approved", f"Hi {user['displayName']},", "",
                     "An administrator did not approve your Closed Loop account.")
    try:
        send(msg, [user["email"]])
    except NotifyError as exc:
        return f"They weren't told: {exc}"
    return None


async def run() -> None:
    """Email every work order that opens, for the life of the server."""
    q = events.subscribe()
    try:
        while True:
            event = await q.get()
            if not should_send(event):
                continue
            try:
                to = repo.emails(work_orders=True)
                if to:
                    await asyncio.to_thread(send, compose(event["workOrder"]), to)
            except Exception:  # noqa: BLE001 — a lost alert must not stop the notifier
                log.warning("notify: no email for %s", event["workOrder"].get("id"), exc_info=True)
    finally:
        events.unsubscribe(q)
