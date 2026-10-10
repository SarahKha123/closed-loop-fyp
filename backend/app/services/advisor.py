"""The Advisor's answering logic: pick what to run, then stream its reply.

The one place that knows a reply can come from Ollama *or* a cloud provider.
`api/chat.py` only turns the text deltas into server-sent events, and the
clients only know how to talk to their own backend.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from . import cloud, model_config, ollama_client


class NoModel(RuntimeError):
    """Nothing is available to answer — the message says why and what to do."""


class ReplyError(RuntimeError):
    """The model failed mid-reply."""


class NoTools(ReplyError):
    """The model refused a request with tools — it can't call them. Chat falls back to the snapshot only."""


@dataclass(frozen=True)
class Target:
    """What will answer: a local Ollama tag, or a cloud provider id."""

    label: str
    local_tag: str | None = None
    cloud_provider: str | None = None


# Small local models have short context windows; a long chat would eventually
# overflow them. Keep system messages plus the most recent turns.
MAX_TURNS = 10


def trim_history(messages: list[dict[str, str]], max_turns: int = MAX_TURNS) -> list[dict[str, str]]:
    """System messages, then the last `max_turns` user/assistant exchanges (2 messages each)."""
    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]
    return system + rest[-2 * max_turns:]


def choose() -> Target:
    """The active model, as the Models page configured it. Raises NoModel if none can answer."""
    resolved = model_config.resolve_now()
    if not resolved["resolved"]:
        raise NoModel(resolved["ollama_error"] or resolved["reason"])
    if resolved["mode"] == "cloud":
        return Target(label=f"{resolved['provider']}/{resolved['tag']}", cloud_provider=resolved["provider"])
    return Target(label=resolved["tag"], local_tag=resolved["tag"])


def stream_reply(target: Target, messages: list[dict[str, str]]) -> Iterator[str]:
    """Text deltas of the reply. Raises ReplyError if the model fails."""
    try:
        if target.cloud_provider:
            yield from cloud.chat_stream(target.cloud_provider, messages)
        else:
            yield from ollama_client.chat_stream(target.local_tag or "", messages)
    except (cloud.CloudError, ollama_client.OllamaError, ollama_client.OllamaUnavailable) as exc:
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
# Ollama and OpenAI-compatible APIs describe tools the same way but differ in
# the reply: Ollama gives `arguments` as a dict and matches results by tool
# name; OpenAI gives a JSON string and matches by call id. Both are hidden here.


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
        if target.cloud_provider:
            msg = cloud.chat_once(target.cloud_provider, messages, tools)
        else:
            msg = ollama_client.chat_once(target.local_tag or "", messages, tools)
    except ollama_client.OllamaError as exc:
        if "support tools" in str(exc).lower():
            NO_TOOLS.add(target.label)
            raise NoTools(str(exc)) from exc
        raise ReplyError(str(exc)) from exc
    except (cloud.CloudError, ollama_client.OllamaUnavailable) as exc:
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


def tool_result(target: Target, call: ToolCall, result: Any) -> dict[str, Any]:
    """The message that hands a tool's result back to the model."""
    content = json.dumps(result, ensure_ascii=False)
    if target.cloud_provider:
        return {"role": "tool", "tool_call_id": call.id, "content": content}
    return {"role": "tool", "tool_name": call.name, "content": content}
