"""Run the insight evaluation (M10, Part B): models × scenarios × validator × repeats.

Each run calls `insights.write()` — the exact generate → grounding check →
one-retry path the app uses — on a frozen scenario snapshot, and appends one
CSV row. Every final text is grounding-checked afterwards too, so runs with the
validator *off* still get a hallucination score (the check just doesn't act).

    backend/.venv/bin/python eval/run.py --models qwen3:1.7b,cloud:openai --validator both

Models: an Ollama tag (a `-cloud` tag such as `gpt-oss:120b-cloud` is
recorded as cloud), or `cloud:<provider>` (configured on the Models page;
uses its saved model). Output: eval/results/<name>.csv plus <name>.config.json
(models, prompt version, Ollama version, hardware, limits). Re-running with
the same --out resumes: finished rows are skipped, failed ones retried.
Each model gets one discarded warm-up call first, so load time isn't counted.

On a CPU-only laptop a local insight takes ~15–30 s: 50 scenarios × 2
validator settings × 3 repeats ≈ 2–3 hours per model. Use --limit and
--repeats for a quick pass; runs are sequential on purpose (one model in RAM).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
# The same limits the app runs with (.env), unless already set in the shell.
for line in (ROOT / ".env").read_text().splitlines() if (ROOT / ".env").exists() else []:
    key, sep, value = line.partition("=")
    if sep and key.strip() and not key.lstrip().startswith("#") and value.strip():
        os.environ.setdefault(key.strip(), value.strip())

from app.services import advisor, cloud, grounding, hardware, insights, ollama_client, prompts  # noqa: E402

SCENARIOS = ROOT / "eval" / "scenarios"
RESULTS = ROOT / "eval" / "results"
FIELDS = ["model", "mode", "scenario", "category", "validator", "repeat", "promptVersion", "attempts",
          "firstGrounded", "grounded", "checked", "matched", "mismatches", "coversComponent", "coversCondition",
          "firstTokenMs", "totalMs", "text", "error", "at"]


def target_for(spec: str) -> advisor.Target:
    if spec.startswith("cloud:"):
        provider = spec.removeprefix("cloud:")
        if provider not in cloud.PROVIDERS:
            sys.exit(f"unknown cloud provider {provider!r}; one of {', '.join(cloud.PROVIDERS)}")
        cfg = cloud.get(provider)
        if not (cfg["api_key"] and cfg["model"]):
            sys.exit(f"{provider} needs a key and a model — set them on the Models page first")
        return advisor.Target(label=f"{provider}/{cfg['model']}", cloud_provider=provider)
    return advisor.Target(label=spec, local_tag=spec)


def coverage(text: str, expected: list[dict]) -> tuple[bool, bool]:
    """(names every expected component, states every expected condition). Nothing expected: says 'optimal'."""
    low = text.lower()
    if not expected:
        return True, "optimal" in low
    return (all(e["component"].lower() in low for e in expected),
            all(e["condition"].lower() in low for e in expected))


def load_done(path: Path) -> set[tuple[str, str, str, str]]:
    if not path.exists():
        return set()
    with path.open(newline="") as f:
        return {(r["model"], r["scenario"], r["validator"], r["repeat"]) for r in csv.DictReader(f) if not r["error"]}


def write_config(path: Path, args: argparse.Namespace, scenarios: list[dict]) -> None:
    if path.exists():
        cfg = json.loads(path.read_text())
        cfg.setdefault("resumedAt", []).append(datetime.now(timezone.utc).isoformat(timespec="seconds"))
    else:
        try:
            ollama = ollama_client.version()
        except Exception:  # noqa: BLE001 — cloud-only runs don't need Ollama
            ollama = None
        cfg = {
            "startedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "models": args.models.split(","),
            "repeats": args.repeats,
            "validator": args.validator,
            "promptVersion": prompts.INSIGHT_VERSION,
            "scenarios": [s["id"] for s in scenarios],
            "ollamaVersion": ollama,
            "limits": {k: os.environ.get(k) for k in ("OLLAMA_CONTEXT_LENGTH", "OLLAMA_NUM_PREDICT", "OLLAMA_NUM_THREAD",
                                                       "OLLAMA_KV_CACHE_TYPE", "OLLAMA_FLASH_ATTENTION")},
            "hardware": hardware.snapshot(),
        }
    path.write_text(json.dumps(cfg, indent=2) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--models", required=True, help="comma-separated: Ollama tags and/or cloud:<provider>")
    ap.add_argument("--validator", choices=["on", "off", "both"], default="both")
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--limit", type=int, help="only the first N scenarios (quick pass)")
    ap.add_argument("--out", help="results name (default: a timestamp); an existing name resumes")
    args = ap.parse_args()

    scenarios = [json.loads(p.read_text()) for p in sorted(SCENARIOS.glob("*.json"))][: args.limit]
    if not scenarios:
        sys.exit("no scenarios — run eval/make_scenarios.py first")
    targets = [target_for(m.strip()) for m in args.models.split(",") if m.strip()]
    validators = ["on", "off"] if args.validator == "both" else [args.validator]

    RESULTS.mkdir(parents=True, exist_ok=True)
    name = args.out or datetime.now().strftime("%Y%m%d-%H%M%S")
    out = RESULTS / f"{name}.csv"
    write_config(RESULTS / f"{name}.config.json", args, scenarios)
    done = load_done(out)
    total = len(targets) * len(scenarios) * len(validators) * args.repeats
    todo = total - sum(1 for t in targets for k in done if k[0] == t.label)
    print(f"{len(scenarios)} scenarios × {len(targets)} models × {validators} × {args.repeats} repeats "
          f"= {total} runs, {todo} to do → {out.relative_to(ROOT)}")

    new_file = not out.exists()
    with out.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        if new_file:
            writer.writeheader()
        started, n = time.perf_counter(), 0
        for target in targets:
            # Ollama's hosted tags (e.g. gpt-oss:120b-cloud) run remotely: they count as cloud
            mode = "cloud" if target.cloud_provider or target.label.endswith("-cloud") else "local"
            if not all((target.label, s["id"], v, str(r)) in done
                       for s in scenarios for v in validators for r in range(1, args.repeats + 1)):
                try:  # warm-up: load the model; not measured
                    advisor.complete(target, [{"role": "user", "content": "Reply with OK."}])
                except advisor.ReplyError as exc:
                    print(f"  warm-up failed for {target.label}: {exc}")
            for repeat in range(1, args.repeats + 1):
                for sc in scenarios:
                    for v in validators:
                        if (target.label, sc["id"], v, str(repeat)) in done:
                            continue
                        row = {"model": target.label, "mode": mode, "scenario": sc["id"], "category": sc["category"],
                               "validator": v, "repeat": repeat, "promptVersion": prompts.INSIGHT_VERSION,
                               "error": "", "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
                        try:
                            w = insights.write(target, sc["snapshot"], check=v == "on")
                        except advisor.ReplyError as exc:
                            row["error"] = str(exc)[:300]
                        else:
                            final = w["check"] or grounding.validate(w["text"], sc["snapshot"])
                            first = w["firstCheck"] or final
                            comp, cond = coverage(w["text"], sc["expected"])
                            row.update({
                                "attempts": w["attempts"], "firstGrounded": int(first["grounded"]),
                                "grounded": int(final["grounded"]), "checked": len(final["checked"]),
                                "matched": sum(c["ok"] for c in final["checked"]),
                                "mismatches": "; ".join(final["mismatches"]),
                                "coversComponent": int(comp), "coversCondition": int(cond),
                                "firstTokenMs": w["firstTokenMs"], "totalMs": w["totalMs"], "text": w["text"],
                            })
                        writer.writerow(row)
                        f.flush()
                        n += 1
                        eta = (time.perf_counter() - started) / n * (todo - n)
                        mark = "ERR" if row["error"] else ("ok " if row.get("grounded") else "✗  ")
                        print(f"  [{n}/{todo}] {mark} {target.label} {sc['id']} validator={v} r{repeat} "
                              f"{row.get('totalMs', '-')} ms  (eta {eta / 60:.0f} min)", flush=True)
    print(f"done → {out.relative_to(ROOT)}; next: backend/.venv/bin/python eval/analyse.py {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
