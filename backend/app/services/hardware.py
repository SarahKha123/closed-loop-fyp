"""What this machine can run — enough to let `model_config.resolve()` pick a
model that actually fits, without Daedalus's full fit-scoring machinery
(no model catalogue, no measured architecture, no live-refresh cache: this
reads on request, which is fine at the scale of one dashboard's model picker).

Same rule as Daedalus's version: every probe is independently guarded. A
machine with no GPU and no `nvidia-smi` is a normal machine, not an error.
"""

from __future__ import annotations

import shutil
import subprocess
from typing import Any

try:
    import psutil
except Exception:  # pragma: no cover - defensive
    psutil = None  # type: ignore[assignment]

GB = 1024**3


def _cpu() -> dict[str, Any]:
    if psutil is None:
        return {"cores_physical": None, "cores_logical": None}
    return {
        "cores_physical": psutil.cpu_count(logical=False),
        "cores_logical": psutil.cpu_count(logical=True),
    }


def _ram() -> dict[str, Any]:
    if psutil is None:
        return {"total_bytes": None, "available_bytes": None}
    mem = psutil.virtual_memory()
    return {"total_bytes": mem.total, "available_bytes": mem.available}


def _gpu() -> dict[str, Any] | None:
    """`nvidia-smi -L` plus a query for name and VRAM. None when there is no NVIDIA GPU."""
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except Exception:
        return None
    if out.returncode != 0 or not out.stdout.strip():
        return None
    first = out.stdout.strip().splitlines()[0]
    parts = [p.strip() for p in first.split(",")]
    if len(parts) < 2:
        return None
    name, vram_mib = parts[0], parts[1]
    try:
        vram_bytes = int(float(vram_mib)) * 1024 * 1024
    except ValueError:
        vram_bytes = None
    return {"name": name, "vram_bytes": vram_bytes}


def snapshot() -> dict[str, Any]:
    return {
        "cpu": _cpu(),
        "ram": _ram(),
        "gpu": _gpu(),
    }
