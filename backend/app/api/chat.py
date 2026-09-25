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

from ..services import hardware, model_config, ollama_client

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _resolve_model(override: str | None) -> tuple[str | None, str | None]:
    """The model to run, and an error to report if none is available."""
    if override:
        return override, None

    try:
        models = ollama_client.list_models()
    except (ollama_client.OllamaUnavailable, ollama_client.OllamaError) as exc:
        return None, str(exc)

    resolved = model_config.resolve(models, hardware.snapshot())
    if not resolved["resolved"]:
        return None, resolved["reason"]
    return resolved["tag"], None


@router.post("")
def chat(
    messages: list[dict[str, str]] = Body(..., embed=True),
    model: str | None = Body(default=None, embed=True),
) -> StreamingResponse:
    if not messages or not any(m.get("content", "").strip() for m in messages if m.get("role") == "user"):
        raise HTTPException(status_code=400, detail="messages must include a user message")

    tag, error = _resolve_model(model)
    if error:
        raise HTTPException(status_code=503, detail=error)

    def events() -> Iterator[str]:
        try:
            for event in ollama_client.chat_stream(tag, messages):  # type: ignore[arg-type]
                if event.get("content"):
                    yield _sse({"phase": "token", "text": event["content"]})
                if event.get("done"):
                    yield _sse({"phase": "done", "model": tag})
        except (ollama_client.OllamaError, ollama_client.OllamaUnavailable) as exc:
            yield _sse({"phase": "error", "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            yield _sse({"phase": "error", "error": f"{exc.__class__.__name__}: {exc}"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
