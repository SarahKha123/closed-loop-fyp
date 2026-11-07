"""Email notifications: a plain-text email to a fixed list for every work order that opens.

Sent through Gmail's SMTP server with an App Password (Python's smtplib, no other dependency).
Configured in .env:

    SMTP_USER=you@gmail.com            the Gmail account that sends
    SMTP_APP_PASSWORD=abcdefghijklmnop  a Google App Password, spaces removed (needs 2-Step Verification), not the account password
    NOTIFY_EMAIL_TO=a@x.com,b@y.com    who receives them
    APP_URL=https://…                  optional: adds a link to the Work orders page

Rules (docs/API.md: Notifications):
- Every work order that opens, automatic or manual. Closing one sends nothing.
- Muted by the `notifications.email` setting, and always in study mode.
- One email per work order: the monitor opens at most one automatic work order per component until a
  technician closes it, so a fast replay can't flood the inbox.
- A failed send is logged and dropped. The work order itself is never affected.

`run()` listens on the event bus like the other workers; the slow SMTP call runs off the event loop.
"""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any

from . import events, settings, work_orders

log = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587  # STARTTLS
SUBJECT_PREFIX = "[Closed Loop]"


class NotifyError(RuntimeError):
    """Email isn't set up, or the SMTP server refused (the message says which)."""


def _config() -> tuple[str, str, list[str]]:
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_APP_PASSWORD", "").replace(" ", "")  # Google shows it in groups of four
    to = [a.strip() for a in os.environ.get("NOTIFY_EMAIL_TO", "").split(",") if a.strip()]
    return user, password, to


def status() -> dict[str, Any]:
    """What the Settings page shows. Never includes the password."""
    user, password, to = _config()
    return {"configured": bool(user and password and to), "sender": user or None, "recipients": len(to)}


def should_send(event: dict[str, Any]) -> bool:
    if event.get("type") != "work_order" or event.get("action") != "opened":
        return False
    s = settings.get()
    return bool(s["notifications"]["email"]) and not s["study"]["enabled"] and status()["configured"]


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
    lines += ["", "— Closed Loop predictive maintenance. Mute these in Settings → Work orders."]

    msg = EmailMessage()
    msg["Subject"] = f"{SUBJECT_PREFIX} {wo['priority']} priority: {wo['component']} {reason} ({wo['id']})"
    msg.set_content("\n".join(lines))
    return msg


def send(msg: EmailMessage) -> None:
    """Send to NOTIFY_EMAIL_TO. Blocking: call it off the event loop."""
    user, password, to = _config()
    if not (user and password and to):
        raise NotifyError("email isn't set up: add SMTP_USER, SMTP_APP_PASSWORD and NOTIFY_EMAIL_TO to .env")
    msg["From"], msg["To"] = f"Closed Loop <{user}>", ", ".join(to)
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


def send_test() -> None:
    msg = EmailMessage()
    msg["Subject"] = f"{SUBJECT_PREFIX} Test email"
    msg.set_content("Email notifications work. You'll get one like this whenever a work order opens.")
    send(msg)


async def run() -> None:
    """Email every work order that opens, for the life of the server."""
    q = events.subscribe()
    try:
        while True:
            event = await q.get()
            if not should_send(event):
                continue
            try:
                await asyncio.to_thread(send, compose(event["workOrder"]))
            except Exception:  # noqa: BLE001 — a lost alert must not stop the notifier
                log.warning("notify: no email for %s", event["workOrder"].get("id"), exc_info=True)
    finally:
        events.unsubscribe(q)
