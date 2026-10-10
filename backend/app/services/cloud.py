"""Cloud models for the Advisor, over the OpenAI-compatible chat API.

Unlike Daedalus (cloud is an offline benchmark only there), this project lets
the Advisor answer from a cloud model. Every provider listed speaks the
OpenAI `/chat/completions` + `/models` shape, Anthropic and Gemini included
via their compatibility endpoints, so one client covers them all.

Keys live in `config/cloud.json`, which is gitignored: the model choice in
`model_config.json` is meant to be committed, a key never is. No response
ever carries a key, only `key_hint` (its last four characters).
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from typing import Any

import httpx

from . import jsonfile, paths

# id → (label, default base URL, where to get a key)
PROVIDERS: dict[str, tuple[str, str, str]] = {
    "openai": ("OpenAI", "https://api.openai.com/v1", "https://platform.openai.com/api-keys"),
    "anthropic": ("Anthropic", "https://api.anthropic.com/v1", "https://console.anthropic.com/settings/keys"),
    "google": ("Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai",
               "https://aistudio.google.com/apikey"),
    "groq": ("Groq", "https://api.groq.com/openai/v1", "https://console.groq.com/keys"),
    "openrouter": ("OpenRouter", "https://openrouter.ai/api/v1", "https://openrouter.ai/keys"),
    "deepseek": ("DeepSeek", "https://api.deepseek.com/v1", "https://platform.deepseek.com/api_keys"),
    "custom": ("Custom (OpenAI-compatible)", "", ""),
}

CHAT_READ_TIMEOUT = 120.0
TEST_TIMEOUT = 10.0

_lock = threading.Lock()


class CloudError(RuntimeError):
    pass


def _read_all() -> dict[str, dict[str, Any]]:
    return jsonfile.read(paths.CLOUD_CONFIG) or {}


def _write_all(data: dict[str, dict[str, Any]]) -> None:
    jsonfile.write_atomic(paths.CLOUD_CONFIG, data, private=True)


def get(provider: str) -> dict[str, Any]:
    """The stored settings for one provider, key included — never return this to a client."""
    if provider not in PROVIDERS:
        raise CloudError(f"unknown provider {provider!r}")
    stored = _read_all().get(provider) or {}
    return {
        "api_key": stored.get("api_key") or "",
        "model": stored.get("model") or "",
        "base_url": (stored.get("base_url") or PROVIDERS[provider][1]).rstrip("/"),
    }


def public() -> list[dict[str, Any]]:
    out = []
    for pid, (label, default_url, docs) in PROVIDERS.items():
        cfg = get(pid)
        key = cfg["api_key"]
        out.append({
            "id": pid,
            "label": label,
            "docs": docs,
            "default_base_url": default_url,
            "base_url": cfg["base_url"],
            "model": cfg["model"],
            "has_key": bool(key),
            "key_hint": f"…{key[-4:]}" if len(key) >= 8 else ("set" if key else None),
            "ready": bool(key and cfg["model"] and cfg["base_url"]),
        })
    return out


def save(provider: str, *, api_key: str | None, model: str | None, base_url: str | None) -> None:
    """Update the fields given; `None` leaves a field as it was, "" clears it."""
    if provider not in PROVIDERS:
        raise CloudError(f"unknown provider {provider!r}")
    if base_url and not base_url.startswith(("https://", "http://")):
        raise CloudError("base URL must start with https:// or http://")
    with _lock:
        data = _read_all()
        entry = data.get(provider) or {}
        for field, value in (("api_key", api_key), ("model", model), ("base_url", base_url)):
            if value is not None:
                entry[field] = value.strip()
        data[provider] = entry
        _write_all(data)


def clear(provider: str) -> None:
    with _lock:
        data = _read_all()
        data.pop(provider, None)
        _write_all(data)


def _headers(provider: str, key: str) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {key}"}
    if provider == "anthropic":
        # Its /models listing wants its own header; the chat compat layer takes the bearer.
        headers |= {"x-api-key": key, "anthropic-version": "2023-06-01"}
    return headers


def test(provider: str) -> list[str]:
    """`GET /models`: checks URL and key without spending tokens. Returns the model ids offered."""
    cfg = get(provider)
    if not cfg["api_key"]:
        raise CloudError("no API key saved")
    if not cfg["base_url"]:
        raise CloudError("no base URL set")
    try:
        r = httpx.get(f"{cfg['base_url']}/models", headers=_headers(provider, cfg["api_key"]), timeout=TEST_TIMEOUT)
    except httpx.HTTPError as exc:
        raise CloudError(f"could not reach {cfg['base_url']} ({exc.__class__.__name__})") from exc
    if r.status_code in (401, 403):
        raise CloudError("the key was rejected")
    if r.status_code >= 400:
        raise CloudError(f"HTTP {r.status_code} from {cfg['base_url']}/models")
    try:
        items = r.json().get("data") or []
    except ValueError:
        items = []
    return sorted(str(m.get("id")) for m in items if isinstance(m, dict) and m.get("id"))


def chat_once(provider: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
    """One non-streamed reply that may call tools: `choices[0].message` (`tool_calls` arguments as JSON strings)."""
    cfg = get(provider)
    if not (cfg["api_key"] and cfg["model"] and cfg["base_url"]):
        raise CloudError(f"{PROVIDERS[provider][0]} is not fully configured (key, model and URL)")
    try:
        r = httpx.post(
            f"{cfg['base_url']}/chat/completions",
            headers=_headers(provider, cfg["api_key"]),
            json={"model": cfg["model"], "messages": messages, "tools": tools, "tool_choice": "auto"},
            timeout=httpx.Timeout(connect=10.0, read=CHAT_READ_TIMEOUT, write=10.0, pool=10.0),
        )
    except httpx.HTTPError as exc:
        raise CloudError(f"lost connection to {cfg['base_url']} ({exc.__class__.__name__})") from exc
    if r.status_code >= 400:
        detail = r.text[:400]
        try:
            err = r.json().get("error")
            detail = err.get("message", detail) if isinstance(err, dict) else str(err or detail)
        except (ValueError, AttributeError):
            pass
        raise CloudError(f"{PROVIDERS[provider][0]}: {detail or f'HTTP {r.status_code}'}")
    try:
        return (r.json().get("choices") or [{}])[0].get("message") or {}
    except (ValueError, AttributeError, IndexError) as exc:
        raise CloudError(f"{PROVIDERS[provider][0]}: unreadable reply") from exc


def chat_stream(provider: str, messages: list[dict[str, str]]) -> Iterator[str]:
    """Yield content deltas from `/chat/completions` with `stream: true`."""
    cfg = get(provider)
    if not (cfg["api_key"] and cfg["model"] and cfg["base_url"]):
        raise CloudError(f"{PROVIDERS[provider][0]} is not fully configured (key, model and URL)")

    try:
        with httpx.stream(
            "POST",
            f"{cfg['base_url']}/chat/completions",
            headers=_headers(provider, cfg["api_key"]),
            json={"model": cfg["model"], "messages": messages, "stream": True},
            timeout=httpx.Timeout(connect=10.0, read=CHAT_READ_TIMEOUT, write=10.0, pool=10.0),
        ) as response:
            if response.status_code >= 400:
                response.read()
                detail = response.text[:400]
                try:
                    err = response.json().get("error")
                    detail = err.get("message", detail) if isinstance(err, dict) else str(err or detail)
                except (ValueError, AttributeError):
                    pass
                raise CloudError(f"{PROVIDERS[provider][0]}: {detail or f'HTTP {response.status_code}'}")
            for line in response.iter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    return
                try:
                    chunk = json.loads(payload)
                except ValueError:
                    continue
                for choice in chunk.get("choices") or []:
                    content = (choice.get("delta") or {}).get("content")
                    if content:
                        yield content
    except httpx.HTTPError as exc:
        raise CloudError(f"lost connection to {cfg['base_url']} ({exc.__class__.__name__})") from exc
