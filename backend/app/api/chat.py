"""`POST /api/chat` — the Advisor's answering endpoint.

Stateless and streamed: the frontend keeps the transcript, sends it whole,
and gets back server-sent events:

    {"phase": "token", "text": "..."}   one per text delta
    {"phase": "done",  "model": "..."}  the reply finished
    {"phase": "error", "error": "..."}  the model failed after streaming began

A failure *before* streaming (no model available) is a plain 503 instead,
because then there is still a status code to send. Which model answers is
decided by `services/advisor.py`, not here.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services import advisor
from .sse import sse_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
def chat(messages: list[dict[str, str]] = Body(..., embed=True)) -> StreamingResponse:
    if not any(m.get("role") == "user" and m.get("content", "").strip() for m in messages):
        raise HTTPException(status_code=400, detail="messages must include a user message")

    try:
        target = advisor.choose()
    except advisor.NoModel as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    def events() -> Iterator[dict[str, Any]]:
        try:
            for text in advisor.stream_reply(target, messages):
                yield {"phase": "token", "text": text}
            yield {"phase": "done", "model": target.label}
        except advisor.ReplyError as exc:
            yield {"phase": "error", "error": str(exc)}

    return sse_response(events())
