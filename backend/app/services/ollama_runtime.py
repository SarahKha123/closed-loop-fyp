"""Installing and starting Ollama itself, so the dashboard can set up local models without a terminal.

Ollama's official installer needs sudo (it writes to /usr/local and adds a
systemd service). This instead unpacks the same release archive into
`config/ollama/` — no root needed — and starts `ollama serve` from there.
An Ollama already on PATH always wins over the local copy.

Linux only: macOS and Windows have their own Ollama apps (https://ollama.com).

Public API:
    status()      {installed, running, binary, can_install}
    install()     streamed {status, percent, done} frames, then starts it (closed-loop.sh setup: start=False)
    start()       start `ollama serve` if it's installed but not answering
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import tarfile
import threading
import time
import urllib.request
from collections.abc import Iterator
from pathlib import Path
from typing import Any, BinaryIO

from . import ollama_client, paths

LOCAL_DIR = paths.CONFIG_DIR / "ollama"
LOCAL_BINARY = LOCAL_DIR / "bin" / "ollama"
PID_FILE = paths.CONFIG_DIR / "ollama.pid"
LOG_FILE = paths.CONFIG_DIR / "ollama.log"
RELEASE_URL = "https://ollama.com/download/ollama-linux-{arch}.tar.zst"
START_TIMEOUT = 20.0

_install_lock = threading.Lock()


class RuntimeSetupError(RuntimeError):
    """Ollama couldn't be installed or started; the message says why."""


def _arch() -> str | None:
    if platform.system() != "Linux":
        return None
    return {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine().lower())


def binary() -> Path | None:
    """The `ollama` to run: one on PATH, else the copy this module installed."""
    on_path = shutil.which("ollama")
    if on_path:
        return Path(on_path)
    return LOCAL_BINARY if os.access(LOCAL_BINARY, os.X_OK) else None


def _running() -> bool:
    try:
        ollama_client.version()
    except (ollama_client.OllamaUnavailable, ollama_client.OllamaError):
        return False
    return True


def status() -> dict[str, Any]:
    found = binary()
    return {
        "installed": found is not None,
        "running": _running(),
        "binary": str(found) if found else None,
        "can_install": _arch() is not None,
    }


def start() -> dict[str, Any]:
    """Start `ollama serve` in the background and wait until it answers.

    It outlives a backend reload on purpose (a reload mid-download would
    otherwise kill it); closed-loop.sh stops it via PID_FILE on Ctrl-C.
    """
    if _running():
        return status()
    found = binary()
    if found is None:
        raise RuntimeSetupError("Ollama isn't installed")
    with LOG_FILE.open("ab") as log:
        proc = subprocess.Popen(  # noqa: S603 — our own binary, fixed arguments
            [str(found), "serve"],
            stdout=log,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    PID_FILE.write_text(str(proc.pid))
    deadline = time.monotonic() + START_TIMEOUT
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeSetupError(f"ollama serve exited (code {proc.returncode}) — see {LOG_FILE}")
        if _running():
            return status()
        time.sleep(0.5)
    raise RuntimeSetupError(f"ollama serve didn't answer within {START_TIMEOUT:.0f} s — see {LOG_FILE}")


class _CountingReader:
    """Wraps the download so progress can be read off the compressed bytes consumed."""

    def __init__(self, raw: BinaryIO) -> None:
        self.raw = raw
        self.read_bytes = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self.raw.read(size)
        self.read_bytes += len(chunk)
        return chunk


def _skip(member: tarfile.TarInfo, want_gpu: bool) -> bool:
    # Most of the archive is GPU runtimes (CUDA, ROCm); a CPU-only machine needn't unpack them.
    name = member.name.lstrip("./")
    return not want_gpu and name.startswith("lib/ollama/") and any(k in name for k in ("cuda_", "rocm", "vulkan"))


def install(start_after: bool = True) -> Iterator[dict[str, Any]]:
    """Download and unpack Ollama into config/ollama/, then start it. Frames are `{status, percent, done}`."""
    if binary() is not None and not start_after:
        yield {"status": "Ollama is already installed", "percent": 100, "done": True}
        return
    if binary() is not None:
        yield {"status": "Ollama is already installed — starting it", "percent": None, "done": False}
        start()
        yield {"status": "Ollama is running", "percent": 100, "done": True}
        return
    arch = _arch()
    if arch is None:
        raise RuntimeSetupError("automatic install is Linux only — get Ollama from https://ollama.com")
    from compression import zstd  # noqa: PLC0415 — Python 3.14+, only needed here

    if not _install_lock.acquire(blocking=False):
        raise RuntimeSetupError("Ollama is already being installed")

    staging = LOCAL_DIR.with_name("ollama.partial")
    try:
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        want_gpu = shutil.which("nvidia-smi") is not None
        url = RELEASE_URL.format(arch=arch)
        yield {"status": "Connecting to ollama.com", "percent": 0, "done": False}
        with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310 — fixed https URL
            total = int(resp.headers.get("Content-Length") or 0)
            counted = _CountingReader(resp)
            last: int | None = -1
            with zstd.ZstdFile(counted) as unzipped, tarfile.open(fileobj=unzipped, mode="r|") as tar:
                for member in tar:
                    if not _skip(member, want_gpu):
                        tar.extract(member, staging, filter="data")
                    percent = int(counted.read_bytes * 100 / total) if total else None
                    if percent != last:
                        last = percent
                        done_mb, total_mb = counted.read_bytes / 1e6, total / 1e6
                        yield {"status": f"Downloading Ollama — {done_mb:,.0f} / {total_mb:,.0f} MB", "percent": percent, "done": False}
        if not (staging / "bin" / "ollama").exists():
            raise RuntimeSetupError("the download didn't contain bin/ollama")
        shutil.rmtree(LOCAL_DIR, ignore_errors=True)
        staging.rename(LOCAL_DIR)
    except OSError as exc:
        raise RuntimeSetupError(f"download failed: {exc}") from exc
    finally:
        shutil.rmtree(staging, ignore_errors=True)
        _install_lock.release()

    if not start_after:
        yield {"status": f"Ollama installed in {LOCAL_DIR}", "percent": 100, "done": True}
        return
    yield {"status": "Starting Ollama", "percent": 100, "done": False}
    start()
    yield {"status": "Ollama is running", "percent": 100, "done": True}
