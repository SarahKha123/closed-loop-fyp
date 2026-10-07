"""Local models worth suggesting on the Models page — a short list, not Daedalus's Forge.

Tags are ones Daedalus's catalogue verified against registry.ollama.ai. Sizes
are an estimate (Q4_K_M ≈ 0.62 GB per billion parameters); the real size shows
up once a model is pulled, from Ollama itself. Anything pulled by tag that
isn't listed here still appears under "Installed".
"""

from __future__ import annotations

from typing import Any

GB = 1024**3
_Q4_GB_PER_B = 0.62

# (tag, label, vendor, params in billions, one-line note)
_MODELS: list[tuple[str, str, str, float, str]] = [
    ("qwen3:0.6b", "Qwen3 0.6B", "Alibaba", 0.6, "Smallest usable; fine for very low-RAM machines"),
    ("gemma3:1b", "Gemma 3 1B", "Google", 1.0, "Tiny and quick, short answers"),
    ("llama3.2:1b", "Llama 3.2 1B", "Meta", 1.24, "Tiny general model"),
    ("qwen3:1.7b", "Qwen3 1.7B", "Alibaba", 1.7, "Good balance for laptops"),
    ("llama3.2:3b", "Llama 3.2 3B", "Meta", 3.2, "Solid general assistant"),
    ("phi4-mini:latest", "Phi-4 Mini 3.8B", "Microsoft", 3.8, "Strong reasoning for its size"),
    ("qwen3:4b", "Qwen3 4B", "Alibaba", 4.0, "Noticeably better answers, still light"),
    ("gemma3:4b", "Gemma 3 4B", "Google", 4.3, "Well-rounded mid-size model"),
    ("mistral:7b", "Mistral 7B", "Mistral AI", 7.0, "Classic 7B; needs ~8 GB RAM free"),
    ("qwen3:8b", "Qwen3 8B", "Alibaba", 8.0, "Best quality here for 16 GB machines"),
    ("llama3.1:8b", "Llama 3.1 8B", "Meta", 8.0, "Long context (128K)"),
    ("gemma3:12b", "Gemma 3 12B", "Google", 12.2, "Needs a GPU or 32 GB RAM to be pleasant"),
]


def local(installed: set[str], ram_total: int | None, safe_fraction: float) -> list[dict[str, Any]]:
    budget = ram_total * safe_fraction if ram_total else None
    out = []
    for tag, label, vendor, params_b, note in _MODELS:
        est = int(params_b * _Q4_GB_PER_B * GB)
        out.append({
            "tag": tag,
            "label": label,
            "vendor": vendor,
            "params_b": params_b,
            "est_size_bytes": est,
            "note": note,
            "installed": tag in installed,
            "fits": None if budget is None else est <= budget,
        })
    return out
