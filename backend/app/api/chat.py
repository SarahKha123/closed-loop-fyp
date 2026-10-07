"""`POST /api/chat` — the Advisor's answering endpoint.

Stateless and streamed: the frontend already keeps the transcript (see
`AppState`), so the request carries the full message list and this endpoint's
only job is turning it into a stream of tokens from whichever model is active.
Framing mirrors Daedalus's `api/chat.py`: server-sent events, one `phase` per
frame, and a terminal `error` phase for anything that goes wrong after the
first byte is already sent (a 503 has nowhere left to go once streaming has
started).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services import cloud, hardware, model_config, ollama_client

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _resolve_model(override: str | None) -> tuple[str | None, str | None, str | None]:
    """(local tag, cloud provider, error) — exactly one of the first two is set unless there's an error."""
    if override:
        return override, None, None

    if model_config.read()["mode"] == "cloud":
        resolved = model_config.resolve([], {})
        if not resolved["resolved"]:
            return None, None, resolved["reason"]
        return None, resolved["provider"], None

    try:
        models = ollama_client.list_models()
    except (ollama_client.OllamaUnavailable, ollama_client.OllamaError) as exc:
        return None, None, str(exc)

    resolved = model_config.resolve(models, hardware.snapshot())
    if not resolved["resolved"]:
        return None, None, resolved["reason"]
    return resolved["tag"], None, None


@router.post("")
def chat(
    messages: list[dict[str, str]] = Body(..., embed=True),
    model: str | None = Body(default=None, embed=True),
) -> StreamingResponse:
    if not messages or not any(m.get("content", "").strip() for m in messages if m.get("role") == "user"):
        raise HTTPException(status_code=400, detail="messages must include a user message")

    tag, provider, error = _resolve_model(model)
    if error:
        raise HTTPException(status_code=503, detail=error)

    def events() -> Iterator[str]:
        try:
            if provider:
                for text in cloud.chat_stream(provider, messages):
                    yield _sse({"phase": "token", "text": text})
                yield _sse({"phase": "done", "model": f"{provider}/{cloud.get(provider)['model']}"})
                return
            for event in ollama_client.chat_stream(tag, messages):  # type: ignore[arg-type]
                if event.get("content"):
                    yield _sse({"phase": "token", "text": event["content"]})
                if event.get("done"):
                    yield _sse({"phase": "done", "model": tag})
        except (ollama_client.OllamaError, ollama_client.OllamaUnavailable, cloud.CloudError) as exc:
            yield _sse({"phase": "error", "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            yield _sse({"phase": "error", "error": f"{exc.__class__.__name__}: {exc}"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
