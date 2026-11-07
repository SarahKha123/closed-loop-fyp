"""Self-check for model selection and the cloud client. Run: backend/.venv/bin/python backend/tests/check_models.py"""

import os
import sys
import tempfile
from pathlib import Path

os.environ["CLOSED_LOOP_CONFIG_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.services import advisor, cloud, db, insights, model_config, repo  # noqa: E402

db.init_db()
uid = repo.insert_user("checker", "Checker", "x")["id"]

# No provider chosen: unresolved.
assert model_config.resolve(uid)["resolved"] is False

# A user's own key: unresolved until key + model exist, then resolved to their provider.
model_config.select(uid, "openai")
assert model_config.resolve(uid)["resolved"] is False
cloud.save(uid, "openai", api_key="sk-abcdefgh1234", model="m-1", base_url=None)
r = model_config.resolve(uid)
assert (r["resolved"], r["provider"], r["tag"]) == (True, "openai", "m-1"), r
assert all("sk-abcdefgh1234" not in str(p) for p in cloud.public(uid))
assert advisor.choose(uid) == advisor.Target(label="openai/m-1", provider="openai", user_id=uid)

# Live insights run on the replay driver's key; nobody driving means none.
assert insights.status()["resolved"] is False
insights.drive({"id": uid, "username": "checker"})
assert insights.status()["resolved"] is True and insights.status()["driver"] == "checker"

# SSE parsing: content deltas joined, empty deltas and [DONE] handled.
sse = (
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
    ": keep-alive\n\n"
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
    "data: [DONE]\n\n"
)
seen = {}


def handler(request: httpx.Request) -> httpx.Response:
    seen["auth"] = request.headers.get("authorization")
    return httpx.Response(200, text=sse)


cloud.httpx.stream = httpx.Client(transport=httpx.MockTransport(handler)).stream
assert "".join(cloud.chat_stream(cloud.config(uid, "openai"), [{"role": "user", "content": "hi"}])) == "Hello"
assert seen["auth"] == "Bearer sk-abcdefgh1234"

# Provider error bodies surface as a readable CloudError.
cloud.httpx.stream = httpx.Client(
    transport=httpx.MockTransport(lambda req: httpx.Response(401, json={"error": {"message": "bad key sk-abcdefgh1234"}}))
).stream
try:
    list(cloud.chat_stream(cloud.config(uid, "openai"), []))
    raise AssertionError("expected CloudError")
except cloud.CloudError as exc:
    assert "bad key" in str(exc) and "sk-abcdefgh1234" not in str(exc)  # an echoed key is scrubbed

print("ok")
