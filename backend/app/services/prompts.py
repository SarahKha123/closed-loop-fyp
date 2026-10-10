"""Every prompt the backend sends to a language model.

Changing a prompt's wording changes what the evaluation measures, so each
prompt has a version that is stored with everything it produced: bump it on
any edit.
"""

from __future__ import annotations

import json
from typing import Any

INSIGHT_VERSION = "insight-v1"

INSIGHT_SYSTEM = """You are the maintenance Advisor for a hydraulic test rig. You receive a JSON snapshot of what \
the monitoring dashboard shows right now; "events" says what just happened.

Write 2 to 4 plain sentences for the maintenance engineer:
- name the component and say what changed (from which condition to which), with the cycle number;
- give its failure probability and its top driver, with the value and unit;
- suggest one concrete maintenance action.

Rules: use only numbers that appear in the snapshot, with their units (you may round them). Never invent \
values, cycle numbers or work order IDs. Mention a work order only by an ID from the snapshot. \
No headings, no bullet points, no preamble."""


def insight_messages(snapshot: dict[str, Any], *, no_think: bool = False) -> list[dict[str, str]]:
    """`no_think`: Qwen3-style reasoning models skip their thinking phase (faster, shorter) with `/no_think`."""
    user = json.dumps(snapshot, ensure_ascii=False)
    return [
        {"role": "system", "content": INSIGHT_SYSTEM},
        {"role": "user", "content": user + (" /no_think" if no_think else "")},
    ]


def retry_message(mismatches: list[str]) -> dict[str, str]:
    """Sent once after a failed grounding check, with what didn't match."""
    return {
        "role": "user",
        "content": "These are not in the snapshot: " + "; ".join(mismatches)
        + ". Rewrite the insight using only values from the snapshot.",
    }


CHAT_VERSION = "chat-v1"

CHAT_SYSTEM = """You are the Advisor in Closed Loop, a predictive-maintenance dashboard for a hydraulic test rig \
(UCI Condition Monitoring of Hydraulic Systems dataset, replayed cycle by cycle). Answer briefly and concretely, \
as a maintenance engineer's assistant. The JSON below is what the dashboard shows right now: use only its values, \
with their units, and if something isn't in it, say you don't know. Mention work orders only by IDs in it."""


def chat_messages(snapshot: dict[str, Any], history: list[dict[str, str]]) -> list[dict[str, str]]:
    """The system prompt with the live snapshot, then the conversation (user/assistant turns only)."""
    state = "No cycles have been replayed yet, so there are no readings." if snapshot["cycle"] is None \
        else json.dumps(snapshot, ensure_ascii=False)
    return [{"role": "system", "content": f"{CHAT_SYSTEM}\n\n{state}"}, *history]
