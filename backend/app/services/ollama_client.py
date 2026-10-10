"""The local LLM runtime (Ollama) — the only module that talks to it.

Ollama may be reachable at different addresses depending on where the backend
runs: a container reaches the host via `host.docker.internal`, which does not
resolve when the backend runs directly on the host. So every call tries the
configured URL first, then its localhost/127.0.0.1 variants, and remembers
whichever answered. That fallback lives in two helpers, `_request` (one-shot
calls) and `_stream` (NDJSON streams); the public functions only shape data.

Public API:
    list_models()        installed models, normalised
    version()            Ollama's version string
    chat_stream(...)     streamed chat reply, as text deltas
    pull(tag)            streamed download progress
    delete(tag)          remove a model

Scaled down from Daedalus's `services/ollama_client.py` (reference only).
"""

from __future__ import annotations

import json
import os
import threading
from collections.abc import Iterator
from typing import Any

import httpx

CONNECT_TIMEOUT = 2.0
LIST_TIMEOUT = 5.0
CHAT_READ_TIMEOUT = 300.0  # a CPU-only machine can take minutes to load a model before the first token
PULL_READ_TIMEOUT = 600.0

_resolved_base: str | None = None
_resolve_lock = threading.Lock()


class OllamaError(RuntimeError):
    """Ollama answered, and said no."""


class OllamaUnavailable(RuntimeError):
    """Nothing answered on any candidate URL."""


# ── where Ollama is ──────────────────────────────────────────────────────────


def candidate_base_urls() -> list[str]:
    """Where to look for Ollama, best guess first — see the module docstring."""
    base = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
    candidates = [base]
    aliases = ("host.docker.internal", "localhost", "127.0.0.1")
    for alias in aliases:
        if alias in base:
            for replacement in aliases:
                url = base.replace(alias, replacement)
                if url not in candidates:
                    candidates.append(url)

    with _resolve_lock:
        known = _resolved_base
    if known in candidates:
        candidates.remove(known)
        candidates.insert(0, known)
    return candidates


def _remember(base: str) -> None:
    global _resolved_base
    with _resolve_lock:
        _resolved_base = base


def _timeout(read: float) -> httpx.Timeout:
    return httpx.Timeout(connect=CONNECT_TIMEOUT, read=read, write=10.0, pool=CONNECT_TIMEOUT)


def _unavailable(last_error: Exception | None) -> OllamaUnavailable:
    tried = ", ".join(candidate_base_urls())
    kind = last_error.__class__.__name__ if last_error else "no response"
    hint = "Start it with `ollama serve`, or check it is installed."
    if "Connect" in kind or "Timeout" in kind:
        hint = (
            "Check it is running (`ollama list` should answer). If Ollama runs on another "
            "machine or in Docker, it binds 127.0.0.1 by default — start it with "
            "OLLAMA_HOST=0.0.0.0 and point OLLAMA_BASE_URL at it."
        )
    return OllamaUnavailable(f"no Ollama daemon answered on {tried} ({kind}). {hint}")


def _error_detail(response: httpx.Response) -> str:
    """Ollama's `{"error": ...}` body if there is one, else the status."""
    try:
        body = response.json()
        if isinstance(body, dict) and body.get("error"):
            return str(body["error"])
    except ValueError:
        pass
    return response.text[:400] or f"HTTP {response.status_code}"


# ── transport: the URL fallback, written once ────────────────────────────────


def _request(method: str, path: str, **kwargs: Any) -> httpx.Response:
    """One call against the first URL that answers. Raises OllamaUnavailable if none does."""
    last_error: Exception | None = None
    for base in candidate_base_urls():
        try:
            response = httpx.request(method, f"{base}{path}", timeout=_timeout(LIST_TIMEOUT), **kwargs)
        except httpx.HTTPError as exc:
            last_error = exc
            continue
        _remember(base)
        return response
    raise _unavailable(last_error)


def _stream(path: str, payload: dict[str, Any], read_timeout: float) -> Iterator[dict[str, Any]]:
    """POST and yield each NDJSON line as a dict. Raises OllamaError on an error line or status.

    Only a failure to *connect* moves on to the next URL; once a stream has
    started, a dropped connection ends it.
    """
    last_error: Exception | None = None
    for base in candidate_base_urls():
        try:
            with httpx.stream("POST", f"{base}{path}", json=payload, timeout=_timeout(read_timeout)) as response:
                _remember(base)
                if response.status_code >= 400:
                    response.read()
                    raise OllamaError(_error_detail(response))
                for line in response.iter_lines():
                    if not line.strip():
                        continue
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    if event.get("error"):
                        raise OllamaError(str(event["error"]))
                    yield event
                return
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            last_error = exc
            continue
        except httpx.HTTPError as exc:
            raise OllamaError(f"connection to Ollama dropped ({exc.__class__.__name__})") from exc
    raise _unavailable(last_error)


# ── public API ───────────────────────────────────────────────────────────────


def _is_embedding(name: str, family: str) -> bool:
    # Ollama's tags carry no capability field, so go by name / family
    # (bert-style families are embedders). Embedding models can't chat.
    return "embed" in name or "bert" in family


def list_models() -> list[dict[str, Any]]:
    """Every model pulled locally. Raises OllamaUnavailable if nothing answers."""
    response = _request("GET", "/api/tags")
    if response.status_code >= 400:
        raise OllamaError(f"HTTP {response.status_code} from /api/tags")
    out: list[dict[str, Any]] = []
    for model in response.json().get("models") or []:
        details = model.get("details") or {}
        name = model.get("name") or ""
        out.append({
            "name": name,
            "size_bytes": model.get("size"),
            "modified_at": model.get("modified_at"),
            "family": details.get("family"),
            "parameter_size": details.get("parameter_size"),
            "quantization_level": details.get("quantization_level"),
            "embedding": _is_embedding(name, details.get("family") or ""),
        })
    return out


def version() -> str | None:
    response = _request("GET", "/api/version")
    return (response.json() or {}).get("version") if response.status_code < 400 else None


def _chat_options() -> dict[str, Any]:
    """Memory/time limits sent with every chat, from the same env vars `ollama serve` reads (.env.example).

    Sent per request too, so they hold even against an Ollama this project didn't start.
    """
    payload: dict[str, Any] = {"keep_alive": os.environ.get("OLLAMA_KEEP_ALIVE", "10m")}
    options = {
        "num_ctx": int(os.environ.get("OLLAMA_CONTEXT_LENGTH", "4096")),   # KV cache RAM grows with this
        "num_predict": int(os.environ.get("OLLAMA_NUM_PREDICT", "1024")),  # caps a runaway reply on a slow CPU
    }
    if os.environ.get("OLLAMA_NUM_THREAD"):
        options["num_thread"] = int(os.environ["OLLAMA_NUM_THREAD"])
    payload["options"] = options
    return payload


def chat_stream(model: str, messages: list[dict[str, str]]) -> Iterator[str]:
    """Stream a chat reply as text deltas."""
    payload = {"model": model, "messages": messages, "stream": True, **_chat_options()}
    for event in _stream("/api/chat", payload, CHAT_READ_TIMEOUT):
        content = (event.get("message") or {}).get("content")
        if content:
            yield content
        if event.get("done"):
            return


def pull(name: str) -> Iterator[dict[str, Any]]:
    """Stream a download as `{status, percent, done}`.

    Ollama's lines change shape through a pull (manifest, per-layer download
    with total/completed, verify, success); `percent` is only set where it
    means something. An interrupted pull resumes from the layers on disk.
    """
    for event in _stream("/api/pull", {"model": name, "stream": True}, PULL_READ_TIMEOUT):
        status = str(event.get("status") or "")
        total, completed = event.get("total"), event.get("completed")
        percent = None
        if isinstance(total, int) and isinstance(completed, int) and total > 0:
            percent = round(min(100.0, completed / total * 100.0), 1)
        yield {"status": status, "percent": percent, "done": status == "success"}


def delete(name: str) -> None:
    response = _request("DELETE", "/api/delete", json={"model": name})
    if response.status_code == 404:
        raise OllamaError(f"{name} is not installed")
    if response.status_code >= 400:
        raise OllamaError(f"HTTP {response.status_code} deleting {name}")
