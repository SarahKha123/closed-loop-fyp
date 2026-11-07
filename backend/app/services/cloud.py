"""Cloud models for the Advisor, over the OpenAI-compatible chat API.

Every provider listed speaks the OpenAI `/chat/completions` + `/models` shape,
Anthropic and Gemini included via their compatibility endpoints, so one client
covers them all.

Two kinds of key, never mixed:

- **Each user's own keys** answer that user's chat. They live in the database
  (`tbl_UserCloud`), encrypted with Fernet under the server's
  `KEY_ENCRYPTION_SECRET` (or a secret generated once into
  `config/secret.key`, owner-only). The plain key exists only in memory for
  the request that uses it; no response carries it, only `key_hint` (its
  last four characters).
- **The server key** writes the live insights, which belong to no one user:
  `CLOUD_PROVIDER` + `CLOUD_API_KEY` + `CLOUD_MODEL` (+ `CLOUD_BASE_URL`), from
  the environment only. It never reaches a browser either.

`user_id=None` below means the server key.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
from collections.abc import Iterator
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken

from . import paths, repo

# id → (label, default base URL, where to get a key)
PROVIDERS: dict[str, tuple[str, str, str]] = {
    "openai": ("OpenAI", "https://api.openai.com/v1", "https://platform.openai.com/api-keys"),
    "anthropic": ("Anthropic", "https://api.anthropic.com/v1", "https://console.anthropic.com/settings/keys"),
    "google": ("Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai",
               "https://aistudio.google.com/apikey"),
    "groq": ("Groq", "https://api.groq.com/openai/v1", "https://console.groq.com/keys"),
    "openrouter": ("OpenRouter", "https://openrouter.ai/api/v1", "https://openrouter.ai/keys"),
    "deepseek": ("DeepSeek", "https://api.deepseek.com/v1", "https://platform.deepseek.com/api_keys"),
    "ollama": ("Ollama Cloud", "https://ollama.com/v1", "https://ollama.com/settings/keys"),
    "custom": ("Custom (OpenAI-compatible)", "", ""),
}

CHAT_READ_TIMEOUT = 120.0
TEST_TIMEOUT = 10.0

_secret_lock = threading.Lock()


class CloudError(RuntimeError):
    pass


# ── encryption at rest ───────────────────────────────────────────────────────


def _fernet() -> Fernet:
    """Fernet keyed by KEY_ENCRYPTION_SECRET, else by a random secret made once in config/secret.key.

    If the secret changes or is lost, saved keys can't be decrypted: they read as "no key" and the
    user pastes theirs again. Nothing else breaks.
    """
    secret = os.environ.get("KEY_ENCRYPTION_SECRET", "").strip()
    if not secret:
        with _secret_lock:
            path = paths.CONFIG_DIR / "secret.key"
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "w") as f:
                    f.write(secrets.token_urlsafe(48))
            secret = path.read_text().strip()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def _encrypt(key: str) -> str:
    return _fernet().encrypt(key.encode()).decode()


def _decrypt(token: str | None) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""  # encrypted under a different secret: unreadable, so treated as no key


# ── settings ─────────────────────────────────────────────────────────────────


def env_provider() -> str | None:
    """The server's provider, from `CLOUD_PROVIDER`, if it names a known one."""
    pid = os.environ.get("CLOUD_PROVIDER", "").strip().lower()
    return pid if pid in PROVIDERS else None


def _check(provider: str) -> None:
    if provider not in PROVIDERS:
        raise CloudError(f"unknown provider {provider!r}")


def get(user_id: int | None, provider: str) -> dict[str, Any]:
    """One provider's settings, key decrypted — for calling the provider only, never for a response."""
    _check(provider)
    if user_id is None:
        own = provider == env_provider()
        stored = {f: os.environ.get(f"CLOUD_{f.upper()}", "").strip() if own else "" for f in ("api_key", "model", "base_url")}
    else:
        row = repo.user_clouds(user_id).get(provider) or {}
        stored = {"api_key": _decrypt(row.get("api_key_enc")), "model": row.get("model") or "", "base_url": row.get("base_url") or ""}
    return {
        "provider": provider,
        "api_key": stored["api_key"],
        "model": stored["model"],
        "base_url": (stored["base_url"] or PROVIDERS[provider][1]).rstrip("/"),
    }


def public(user_id: int) -> list[dict[str, Any]]:
    """Every provider as this user has set it up. Safe to send: no key, only its last four characters."""
    out = []
    for pid, (label, default_url, docs) in PROVIDERS.items():
        cfg = get(user_id, pid)
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


def save(user_id: int, provider: str, *, api_key: str | None, model: str | None, base_url: str | None) -> None:
    """Update the fields given; `None` leaves a field as it was, "" clears it. The key is stored encrypted."""
    _check(provider)
    if base_url and not base_url.startswith(("https://", "http://")):
        raise CloudError("base URL must start with https:// or http://")
    fields: dict[str, str | None] = {}
    if api_key is not None:
        fields["api_key_enc"] = _encrypt(api_key.strip()) if api_key.strip() else None
    if model is not None:
        fields["model"] = model.strip()
    if base_url is not None:
        fields["base_url"] = base_url.strip()
    repo.save_user_cloud(user_id, provider, fields)


def clear(user_id: int, provider: str) -> None:
    _check(provider)
    repo.delete_user_cloud(user_id, provider)


def _headers(provider: str, key: str) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {key}"}
    if provider == "anthropic":
        # Its /models listing wants its own header; the chat compat layer takes the bearer.
        headers |= {"x-api-key": key, "anthropic-version": "2023-06-01"}
    return headers


def _error(cfg: dict[str, Any], status: int, body: str, parsed: Any) -> CloudError:
    """A provider's error as one readable line, with the key scrubbed if the provider echoed it."""
    detail = body[:400]
    try:
        err = parsed().get("error")
        detail = err.get("message", detail) if isinstance(err, dict) else str(err or detail)
    except (ValueError, AttributeError):
        pass
    if cfg["api_key"]:
        detail = detail.replace(cfg["api_key"], "[key]")
    return CloudError(f"{PROVIDERS[cfg['provider']][0]}: {detail or f'HTTP {status}'}")


def test(user_id: int, provider: str) -> list[str]:
    """`GET /models`: checks URL and key without spending tokens. Returns the model ids offered."""
    cfg = get(user_id, provider)
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


def config(user_id: int | None, provider: str, model: str | None = None) -> dict[str, Any]:
    """`get()`, with `model` (when given) in place of the saved one; raises if anything is missing."""
    cfg = get(user_id, provider)
    cfg["model"] = model or cfg["model"]
    if not (cfg["api_key"] and cfg["model"] and cfg["base_url"]):
        raise CloudError(f"{PROVIDERS[provider][0]} is not fully configured (key, model and URL)")
    return cfg


def chat_once(cfg: dict[str, Any], messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
    """One non-streamed reply that may call tools: `choices[0].message` (`tool_calls` arguments as JSON strings).

    `cfg` comes from `config()`.
    """
    provider = cfg["provider"]
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
        raise _error(cfg, r.status_code, r.text, r.json)
    try:
        return (r.json().get("choices") or [{}])[0].get("message") or {}
    except (ValueError, AttributeError, IndexError) as exc:
        raise CloudError(f"{PROVIDERS[provider][0]}: unreadable reply") from exc


def chat_stream(cfg: dict[str, Any], messages: list[dict[str, str]]) -> Iterator[str]:
    """Yield content deltas from `/chat/completions` with `stream: true`. `cfg` comes from `config()`."""
    provider = cfg["provider"]
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
                raise _error(cfg, response.status_code, response.text, response.json)
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
