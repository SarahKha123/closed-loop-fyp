"""Self-check for model selection and the cloud client. Run: backend/.venv/bin/python backend/tests/check_models.py"""

import os
import sys
import tempfile
from pathlib import Path

os.environ["CLOSED_LOOP_CONFIG_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.services import advisor, cloud, model_config  # noqa: E402

# No provider chosen (or an old local `auto` / `pinned` file): unresolved.
assert model_config.resolve()["resolved"] is False
(Path(os.environ["CLOSED_LOOP_CONFIG_DIR"]) / "model_config.json").write_text('{"mode": "pinned", "pinned": "qwen3:1.7b"}')
assert model_config.resolve()["provider"] is None

# Unresolved until key + model exist, then resolved to the provider.
model_config.write("openai")
assert model_config.resolve()["resolved"] is False
cloud.save("openai", api_key="sk-abcdefgh1234", model="m-1", base_url=None)
r = model_config.resolve()
assert (r["resolved"], r["provider"], r["tag"], r["managed"]) == (True, "openai", "m-1", False), r
assert all("sk-abcdefgh1234" not in str(p) for p in cloud.public())
assert advisor.choose() == advisor.Target(label="openai/m-1", provider="openai")

# The environment overrides the files, and locks the choice.
os.environ.update(CLOUD_PROVIDER="groq", CLOUD_API_KEY="gsk-env-key-9999", CLOUD_MODEL="llama-3.1-8b-instant")
r = model_config.resolve()
assert (r["resolved"], r["provider"], r["tag"], r["managed"]) == (True, "groq", "llama-3.1-8b-instant", True), r
try:
    model_config.write("openai")
    raise AssertionError("expected ValueError")
except ValueError:
    pass
assert all("gsk-env-key-9999" not in str(p) for p in cloud.public())
for k in ("CLOUD_PROVIDER", "CLOUD_API_KEY", "CLOUD_MODEL"):
    del os.environ[k]

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
assert "".join(cloud.chat_stream("openai", [{"role": "user", "content": "hi"}])) == "Hello"
assert seen["auth"] == "Bearer sk-abcdefgh1234"

# Provider error bodies surface as a readable CloudError.
cloud.httpx.stream = httpx.Client(
    transport=httpx.MockTransport(lambda req: httpx.Response(401, json={"error": {"message": "bad key"}}))
).stream
try:
    list(cloud.chat_stream("openai", []))
    raise AssertionError("expected CloudError")
except cloud.CloudError as exc:
    assert "bad key" in str(exc)

print("ok")
