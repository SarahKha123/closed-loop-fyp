"""What this machine can run — enough to let `model_config.resolve()` pick a
model that actually fits, and for the Models page's Hardware tab to explain
why. Far smaller than Daedalus's (no live-refresh cache, no WSL host probe):
this reads on request, which is fine for one dashboard.

Same rule as Daedalus's version: every probe is independently guarded. A
machine with no GPU and no `nvidia-smi` is a normal machine, not an error.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any

try:
    import psutil
except Exception:  # pragma: no cover - defensive
    psutil = None  # type: ignore[assignment]

GB = 1024**3


def _cpu_model() -> str | None:
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or None


def _cpu(detailed: bool) -> dict[str, Any]:
    out: dict[str, Any] = {"cores_physical": None, "cores_logical": None}
    if psutil is not None:
        out["cores_physical"] = psutil.cpu_count(logical=False)
        out["cores_logical"] = psutil.cpu_count(logical=True)
    if detailed:
        out["model"] = _cpu_model()
        out["arch"] = platform.machine() or None
        # A 0.2s sample: only on the Hardware tab, never on the chat path.
        out["load_percent"] = psutil.cpu_percent(interval=0.2) if psutil is not None else None
    return out


def _ram() -> dict[str, Any]:
    if psutil is None:
        return {"total_bytes": None, "available_bytes": None}
    mem = psutil.virtual_memory()
    return {"total_bytes": mem.total, "available_bytes": mem.available}


def _gpu() -> dict[str, Any] | None:
    """First NVIDIA GPU via `nvidia-smi`. None when there is none."""
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,driver_version,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except Exception:
        return None
    if out.returncode != 0 or not out.stdout.strip():
        return None
    parts = [p.strip() for p in out.stdout.strip().splitlines()[0].split(",")]
    if len(parts) < 2:
        return None

    def mib(i: int) -> int | None:
        try:
            return int(float(parts[i])) * 1024 * 1024
        except (IndexError, ValueError):
            return None

    def num(i: int) -> float | None:
        try:
            return float(parts[i])
        except (IndexError, ValueError):
            return None

    return {
        "name": parts[0],
        "vram_bytes": mib(1),
        "vram_used_bytes": mib(2),
        "driver_version": parts[3] if len(parts) > 3 else None,
        "load_percent": num(4),
    }


def _models_dir() -> str:
    """Where Ollama keeps weights on this machine, or the nearest existing parent."""
    for candidate in (
        os.environ.get("OLLAMA_MODELS"),
        "/usr/share/ollama/.ollama/models",  # Linux service install
        str(Path.home() / ".ollama" / "models"),
    ):
        if candidate and Path(candidate).exists():
            return candidate
    return str(Path.home())


def _disk() -> dict[str, Any]:
    path = _models_dir()
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return {"path": path, "total_bytes": None, "free_bytes": None}
    return {"path": path, "total_bytes": usage.total, "free_bytes": usage.free}


def _host() -> dict[str, Any]:
    release = platform.release() or ""
    return {
        "os": platform.system() or None,
        "release": release or None,
        "wsl": "microsoft" in release.lower(),
        "container": Path("/.dockerenv").exists(),
    }


def snapshot(detailed: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {"cpu": _cpu(detailed), "ram": _ram(), "gpu": _gpu()}
    if detailed:
        out["disk"] = _disk()
        out["host"] = _host()
    return out
