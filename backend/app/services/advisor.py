"""The Advisor's answering logic: pick what to run, then stream its reply.

The one place that knows which cloud provider answers. `api/chat.py` only
turns the text deltas into server-sent events.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from . import cloud, model_config


class NoModel(RuntimeError):
    """Nothing is available to answer — the message says why and what to do."""


class ReplyError(RuntimeError):
    """The model failed mid-reply."""


class NoTools(ReplyError):
    """The model refused a request with tools — it can't call them. Chat falls back to the snapshot only."""


@dataclass(frozen=True)
class Target:
    """What will answer: a provider, labelled `provider/model`, on a user's own key."""

    label: str
    provider: str
    user_id: int
    model: str | None = None  # None: the saved model. The evaluation sets it to compare models.


# A long chat would eventually overflow a small model's context window (and
# costs tokens on every turn). Keep system messages plus the most recent turns.
MAX_TURNS = 10


def trim_history(messages: list[dict[str, str]], max_turns: int = MAX_TURNS) -> list[dict[str, str]]:
    """System messages, then the last `max_turns` user/assistant exchanges (2 messages each)."""
    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]
    return system + rest[-2 * max_turns:]


def choose(user_id: int) -> Target:
    """The model a user answers on (their chat, or insights while they drive). Raises NoModel if none can answer."""
    resolved = model_config.resolve(user_id)
    if not resolved["resolved"]:
        raise NoModel(resolved["reason"])
    return Target(label=f"{resolved['provider']}/{resolved['tag']}", provider=resolved["provider"], user_id=user_id)


def _config(target: Target) -> dict[str, Any]:
    return cloud.config(target.user_id, target.provider, target.model)


def stream_reply(target: Target, messages: list[dict[str, str]]) -> Iterator[str]:
    """Text deltas of the reply. Raises ReplyError if the model fails."""
    try:
        yield from cloud.chat_stream(_config(target), messages)
    except cloud.CloudError as exc:
        raise ReplyError(str(exc)) from exc


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def complete(target: Target, messages: list[dict[str, str]]) -> tuple[str, int | None, int]:
    """The whole reply at once, for the insight engine: (text, first-token ms, total ms).

    Streams underneath so the time to the first token can be measured. Any
    reasoning a model prints inline (<think>…</think>) is dropped.
    """
    start = time.perf_counter()
    first: int | None = None
    parts: list[str] = []
    for delta in stream_reply(target, messages):
        if first is None:
            first = round((time.perf_counter() - start) * 1000)
        parts.append(delta)
    total = round((time.perf_counter() - start) * 1000)
    return _THINK.sub("", "".join(parts)).strip(), first, total


# ── tool calls (M9) ──────────────────────────────────────────────────────────
#
# OpenAI-compatible replies give `arguments` as a JSON string and match results
# by call id. Some providers send a dict instead; both are accepted.


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


# Models that refused tools once this run; asked without tools from then on.
NO_TOOLS: set[str] = set()


def tool_round(target: Target, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> tuple[str, list[ToolCall], dict[str, Any]]:
    """One non-streamed reply: (text, tool calls, the assistant message to append before the results).

    Raises NoTools if the model can't take tools, ReplyError on any other failure.
    """
    try:
        msg = cloud.chat_once(_config(target), messages, tools)
    except cloud.CloudError as exc:
        text = str(exc).lower()
        # "does not support tools", "No endpoints found that support tool use", …
        if "tool" in text and "support" in text:
            NO_TOOLS.add(target.label)
            raise NoTools(str(exc)) from exc
        raise ReplyError(str(exc)) from exc

    calls = []
    for i, c in enumerate(msg.get("tool_calls") or []):
        fn = c.get("function") or {}
        args = fn.get("arguments") or {}
        if isinstance(args, str):
            try:
                args = json.loads(args or "{}")
            except ValueError:
                args = {}
        calls.append(ToolCall(id=str(c.get("id") or f"call_{i}"), name=str(fn.get("name") or ""),
                              args=args if isinstance(args, dict) else {}))
    assistant = {"role": "assistant", "content": msg.get("content") or ""}
    if msg.get("tool_calls"):
        assistant["tool_calls"] = msg["tool_calls"]
    return _THINK.sub("", msg.get("content") or "").strip(), calls, assistant


def tool_result(call: ToolCall, result: Any) -> dict[str, Any]:
    """The message that hands a tool's result back to the model."""
    return {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, ensure_ascii=False)}
