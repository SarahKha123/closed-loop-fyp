"""The Advisor's answering logic: pick what to run, then stream its reply.

The one place that knows a reply can come from Ollama *or* a cloud provider.
`api/chat.py` only turns the text deltas into server-sent events, and the
clients only know how to talk to their own backend.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from . import cloud, model_config, ollama_client


class NoModel(RuntimeError):
    """Nothing is available to answer — the message says why and what to do."""


class ReplyError(RuntimeError):
    """The model failed mid-reply."""


@dataclass(frozen=True)
class Target:
    """What will answer: a local Ollama tag, or a cloud provider id."""

    label: str
    local_tag: str | None = None
    cloud_provider: str | None = None


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
