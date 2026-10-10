"""`POST /api/chat` — the Advisor's answering endpoint.

The frontend keeps the transcript and sends its user/assistant turns; the
backend adds the system prompt with the live snapshot (services/snapshot.py),
caps the history (`chat.maxTurns`), and streams server-sent events:

    {"phase": "token", "text": "..."}   one per text delta
    {"phase": "done",  "model": "...", "grounded": true|false|null, "validation": {...}|null}
    {"phase": "error", "error": "..."}  the model failed after streaming began

Each finished answer is grounding-checked against the snapshot it was given
and logged to tbl_Insight with TriggerType "chat" (for the evaluation).
A failure *before* streaming (no model available) is a plain 503 instead,
because then there is still a status code to send.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services import advisor, grounding, prompts, repo, settings, snapshot
from .sse import sse_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
def chat(messages: list[dict[str, str]] = Body(..., embed=True)) -> StreamingResponse:
    turns = [m for m in messages if m.get("role") in ("user", "assistant") and m.get("content", "").strip()]
    if not turns or turns[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="messages must end with a user message")

    try:
        target = advisor.choose()
    except advisor.NoModel as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    conf = settings.get()
    snap = snapshot.build()
    full = prompts.chat_messages(snap, advisor.trim_history(turns, conf["chat"]["maxTurns"]))

    def events() -> Iterator[dict[str, Any]]:
        start, first, parts = time.perf_counter(), None, []
        try:
            for text in advisor.stream_reply(target, full):
                first = first or round((time.perf_counter() - start) * 1000)
                parts.append(text)
                yield {"phase": "token", "text": text}
        except advisor.ReplyError as exc:
            yield {"phase": "error", "error": str(exc)}
            return
        answer = "".join(parts).strip()
        check = grounding.validate(answer, snap) if conf["grounding"]["enabled"] and snap["cycle"] else None
        repo.insert_insight(
            trigger_type="chat", trigger_ref=turns[-1]["content"][:500], model=target.label,
            mode="cloud" if target.cloud_provider else "local", prompt_version=prompts.CHAT_VERSION,
            snapshot=snap, text=answer, cycle=snap["cycle"], grounded=check and check["grounded"],
            validation=check, latency_ms=round((time.perf_counter() - start) * 1000), first_token_ms=first,
        )
        yield {"phase": "done", "model": target.label, "grounded": check and check["grounded"], "validation": check}

    return sse_response(events())
