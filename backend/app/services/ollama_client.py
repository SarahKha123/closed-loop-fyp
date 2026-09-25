"""The local LLM runtime the model picker and Advisor talk to.

A scaled-down version of Daedalus's `services/ollama_client.py`: same
candidate-URL fallback (a container reaches the host via
`host.docker.internal`, which does not resolve when the backend runs directly
on the host, so localhost and 127.0.0.1 are tried too), same "answer, don't
raise" contract for listing models, and a streaming `chat()` in place of
Daedalus's `generate()` — the Advisor is a multi-turn conversation, not a
single completion.
"""

from __future__ import annotations

import json
import os
import threading
from collections.abc import Iterator
from typing import Any

try:
    import httpx
except Exception:  # pragma: no cover - defensive
    httpx = None  # type: ignore[assignment]

CONNECT_TIMEOUT = 2.0
LIST_TIMEOUT = 5.0
CHAT_READ_TIMEOUT = 120.0

_resolved_base: str | None = None
_resolve_lock = threading.Lock()


class OllamaError(RuntimeError):
    """Ollama answered, and said no."""


class OllamaUnavailable(RuntimeError):
    """Nothing answered on any candidate URL."""


def candidate_base_urls() -> list[str]:
    """Where to look for Ollama, best guess first — see the module docstring."""
    base = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
    candidates = [base]

    def add(url: str) -> None:
        if url not in candidates:
            candidates.append(url)

    if any(alias in base for alias in ("host.docker.internal", "localhost", "127.0.0.1")):
        for alias in ("host.docker.internal", "localhost", "127.0.0.1"):
            for replacement in ("localhost", "127.0.0.1", "host.docker.internal"):
                if alias in base:
                    add(base.replace(alias, replacement))

    with _resolve_lock:
        known = _resolved_base
    if known and known in candidates:
        candidates.remove(known)
        candidates.insert(0, known)
    return candidates


def _remember(base: str) -> None:
    global _resolved_base
    with _resolve_lock:
        _resolved_base = base


def _timeout(read: float) -> Any:
    return httpx.Timeout(connect=CONNECT_TIMEOUT, read=read, write=10.0, pool=CONNECT_TIMEOUT)


def _unavailable_message(last_error: Exception | None) -> str:
    tried = ", ".join(candidate_base_urls())
    kind = last_error.__class__.__name__ if last_error else "no response"
    hint = "Start it with `ollama serve`, or check it is installed."
    if "Connect" in kind or "Timeout" in kind:
        hint = (
            "Check it is running (`ollama list` should answer). If Ollama runs on another "
            "machine or in Docker, it binds 127.0.0.1 by default — start it with "
            "OLLAMA_HOST=0.0.0.0 and point OLLAMA_BASE_URL at it."
        )
    return f"no Ollama daemon answered on {tried} ({kind}). {hint}"


def available() -> bool:
    if httpx is None:
        return False
    for base in candidate_base_urls():
        try:
            httpx.get(f"{base}/api/version", timeout=_timeout(2.0))
        except Exception:
            continue
        _remember(base)
        return True
    return False


def list_models() -> list[dict[str, Any]]:
    """Every model pulled locally. Raises OllamaUnavailable if nothing answers."""
    if httpx is None:
        raise OllamaUnavailable("httpx is not installed")

    last_error: Exception | None = None
    for base in candidate_base_urls():
        try:
            response = httpx.get(f"{base}/api/tags", timeout=_timeout(LIST_TIMEOUT))
        except Exception as exc:
            last_error = exc
            continue
        _remember(base)
        if response.status_code >= 400:
            raise OllamaError(f"HTTP {response.status_code} from {base}/api/tags")
        data = response.json()
        out: list[dict[str, Any]] = []
        for model in data.get("models") or []:
            details = model.get("details") or {}
            out.append({
                "name": model.get("name"),
                "size_bytes": model.get("size"),
                "modified_at": model.get("modified_at"),
                "family": details.get("family"),
                "parameter_size": details.get("parameter_size"),
                "quantization_level": details.get("quantization_level"),
            })
        return out

    raise OllamaUnavailable(_unavailable_message(last_error))


def chat_stream(model: str, messages: list[dict[str, str]]) -> Iterator[dict[str, Any]]:
    """Stream a chat completion, yielding `{"content": ...}` deltas then `{"done": True}`.

    Non-streaming calls (`show`, `pull`, benchmarking) are what Daedalus needs
    from this client; the Advisor only ever needs this one call, so it is the
    only one implemented here.
    """
    if httpx is None:
        raise OllamaUnavailable("httpx is not installed")

    last_error: Exception | None = None
    for base in candidate_base_urls():
        try:
            with httpx.stream(
                "POST",
                f"{base}/api/chat",
                json={"model": model, "messages": messages, "stream": True},
                timeout=_timeout(CHAT_READ_TIMEOUT),
            ) as response:
                _remember(base)
                if response.status_code >= 400:
                    response.read()
                    detail = response.text[:400] or f"HTTP {response.status_code}"
                    try:
                        body = response.json()
                        if isinstance(body, dict) and body.get("error"):
                            detail = str(body["error"])
                    except Exception:
                        pass
                    raise OllamaError(detail)

                for line in response.iter_lines():
                    if not line.strip():
                        continue
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    if event.get("error"):
                        raise OllamaError(str(event["error"]))
                    message = event.get("message") or {}
                    content = message.get("content") or ""
                    if content:
                        yield {"content": content}
                    if event.get("done"):
                        yield {"done": True}
                        return
                return
        except (OllamaError, OllamaUnavailable):
            raise
        except Exception as exc:
            last_error = exc
            continue

    raise OllamaUnavailable(_unavailable_message(last_error))
