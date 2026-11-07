"""`POST /api/chat` — the Advisor's answering endpoint, and `POST /api/chat/confirm` for its actions.

The frontend keeps the transcript and sends its user/assistant turns; the
backend adds the system prompt with the live snapshot (services/snapshot.py),
caps the history (`chat.maxTurns`), and streams server-sent events:

    {"phase": "tool", "name": "...", "args": {...}}   the model looked something up
    {"phase": "confirm", "action": {...}}             the model proposes a work order; the UI asks
    {"phase": "token", "text": "..."}                 answer text
    {"phase": "done", "model": "...", "tools": bool, "grounded": true|false|null, "validation": {...}|null}
    {"phase": "error", "error": "..."}                the model failed after streaming began

With tools (`chat.tools`, and a model that accepts them) the answer arrives as
one `token` after the tool loop (services/tools.py); without, it streams.
`done.tools` is false only when the model refused tools, so the UI can say it
can't take actions (true when tools were simply off or not needed).

Each finished answer is grounding-checked against the snapshot plus any tool
results it was given, and logged to tbl_Insight with TriggerType "chat".
A failure *before* streaming (no model available) is a plain 503 instead,
because then there is still a status code to send.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services import advisor, grounding, prompts, repo, settings, snapshot, tools
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
    history = advisor.trim_history(turns, conf["chat"]["maxTurns"])
    use_tools = conf["chat"]["tools"] and snap["cycle"] is not None and target.label not in advisor.NO_TOOLS

    def events() -> Iterator[dict[str, Any]]:
        start, first, parts = time.perf_counter(), None, []
        results: list[dict[str, Any]] = []
        tools_ok = target.label not in advisor.NO_TOOLS  # false only when this model refused tools
        try:
            answer = None
            if use_tools:
                try:
                    for e in tools.converse(target, prompts.chat_messages(snap, history, tools=True), results):
                        if e["phase"] == "answer":
                            answer = e["text"]
                        else:
                            yield e
                except advisor.NoTools:
                    tools_ok = False
            if answer is not None:
                first = round((time.perf_counter() - start) * 1000)
                parts.append(answer)
                yield {"phase": "token", "text": answer}
            else:
                for text in advisor.stream_reply(target, prompts.chat_messages(snap, history)):
                    first = first or round((time.perf_counter() - start) * 1000)
                    parts.append(text)
                    yield {"phase": "token", "text": text}
        except advisor.ReplyError as exc:
            yield {"phase": "error", "error": str(exc)}
            return
        answer = "".join(parts).strip()
        seen = {**snap, "toolResults": results} if results else snap
        check = grounding.validate(answer, seen) if conf["grounding"]["enabled"] and snap["cycle"] else None
        repo.insert_insight(
            trigger_type="chat", trigger_ref=turns[-1]["content"][:500], model=target.label,
            mode="cloud", prompt_version=prompts.CHAT_VERSION,
            snapshot=seen, text=answer, cycle=snap["cycle"], grounded=check and check["grounded"],
            validation=check, latency_ms=round((time.perf_counter() - start) * 1000), first_token_ms=first,
        )
        yield {"phase": "done", "model": target.label, "tools": tools_ok,
               "grounded": check and check["grounded"], "validation": check}

    return sse_response(events())


@router.post("/confirm")
def confirm(id: str = Body(...), approve: bool = Body(...)) -> dict[str, Any]:  # noqa: A002 — the API's field name
    """The engineer's answer to a proposed action. Approving creates the work order (CreatedBy = user)."""
    out = tools.confirm(id, approve)
    if out is None:
        raise HTTPException(status_code=404, detail="no such proposal, or it was already answered")
    return out
