"""System performance run (M10, Part D) against a running backend.

    ./closed-loop.sh start                      # in another terminal
    backend/.venv/bin/python eval/system_perf.py --yes [--speed 0.2] [--cycles 2205] [--insights off]

Signs in as an admin: prompts for username and password, or set CLOSED_LOOP_SESSION to
the browser's closed_loop_session cookie (for Google sign-in accounts).

Resets the replay (THIS EMPTIES THE DATABASE — hence --yes), plays --cycles
cycles from cycle 1 at --speed seconds per cycle, and listens on /api/stream
like a browser does. Per cycle it records, at the client:

- scoring latency: `cycle` event → that cycle's `prediction` event (the
  predictor's four models + SHAP, the database writes and the publish; both
  events travel the same stream, so delivery time largely cancels out);
- the backend process's memory (RSS) every 100 cycles (should stay flat);
- every insight's own latency (from its record), when insights are on.

Writes eval/results/perf-<timestamp>.csv (one row per cycle) and .md (the summary).
"""

from __future__ import annotations

import argparse
import csv
import getpass
import os
import json
import statistics
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import httpx
import psutil

RESULTS = Path(__file__).resolve().parent / "results"


def server_process(url: str) -> psutil.Process | None:
    port = httpx.URL(url).port or 80
    for c in psutil.net_connections(kind="tcp"):
        if c.laddr and c.laddr.port == port and c.status == psutil.CONN_LISTEN and c.pid:
            return psutil.Process(c.pid)
    return None


def sign_in(api: httpx.Client) -> None:
    """The API needs a signed-in admin: CLOSED_LOOP_SESSION (the browser's closed_loop_session cookie) or a password prompt."""
    if cookie := os.environ.get("CLOSED_LOOP_SESSION"):
        api.cookies.set("closed_loop_session", cookie)
    else:
        r = api.post("/api/auth/login", json={"username": input("username: "), "password": getpass.getpass("password: ")})
        if r.status_code != 200:
            sys.exit(f"sign-in failed: {r.json().get('detail', r.status_code)}")
    if api.get("/api/settings").status_code != 200:
        sys.exit("signed in, but this account can't change settings — use an admin account")


def p90(xs: list[float]) -> float:
    return statistics.quantiles(xs, n=10)[-1] if len(xs) >= 2 else (xs[0] if xs else float("nan"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--speed", type=float, default=0.2, help="seconds per cycle (min 0.05)")
    ap.add_argument("--cycles", type=int, default=2205)
    ap.add_argument("--insights", choices=["on", "off", "keep"], default="keep", help="switch the insight engine for the run")
    ap.add_argument("--yes", action="store_true", help="confirm: the run resets the replay and empties the database")
    args = ap.parse_args()
    if not args.yes:
        sys.exit("this resets the replay and empties the database — re-run with --yes")

    api = httpx.Client(base_url=args.url, timeout=30)
    sign_in(api)
    try:
        api.get("/api/health").raise_for_status()
    except httpx.HTTPError as exc:
        sys.exit(f"no backend at {args.url} ({exc}) — start it with ./closed-loop.sh start")
    proc = server_process(args.url)
    if proc is None:
        print("  (couldn't find the server process: memory won't be recorded)")
    before = api.get("/api/settings").json()["insights"]["enabled"]
    if args.insights != "keep":
        api.put("/api/settings", json={"insights": {"enabled": args.insights == "on"}})

    cycle_at: dict[int, float] = {}
    pred_at: dict[int, float] = {}
    rss: dict[int, float] = {}
    insight_ids: list[int] = []
    last = args.cycles
    done = threading.Event()

    def listen() -> None:
        with api.stream("GET", "/api/stream", timeout=httpx.Timeout(10, read=None)) as r:
            for line in r.iter_lines():
                if not line.startswith("data:"):
                    continue
                e, now = json.loads(line[5:]), time.perf_counter()
                if e["type"] == "cycle":
                    cycle_at[e["cycle"]] = now
                    if proc and e["cycle"] % 100 == 0:
                        rss[e["cycle"]] = proc.memory_info().rss / 2**20
                elif e["type"] == "prediction":
                    pred_at.setdefault(e["cycle"], now)
                    if e["cycle"] >= last:
                        done.set()
                        return
                elif e["type"] == "insight":
                    insight_ids.append(e["insight"]["id"])

    threading.Thread(target=listen, daemon=True).start()
    time.sleep(1)
    api.post("/api/replay/reset", json={"cycle": 1})
    api.post("/api/replay/speed", json={"secondsPerCycle": args.speed})
    if proc:
        rss[0] = proc.memory_info().rss / 2**20
    start = time.perf_counter()
    api.post("/api/replay/play")
    print(f"playing {args.cycles} cycles at {args.speed} s/cycle (~{args.cycles * args.speed / 60:.0f} min)…", flush=True)
    while not done.wait(5):
        n = len(pred_at)
        print(f"  {n}/{args.cycles} scored", flush=True)
        if n >= args.cycles or (api.get("/api/replay").json()["state"] == "finished" and n >= len(cycle_at)):
            break
    api.post("/api/replay/pause")
    wall = time.perf_counter() - start
    time.sleep(1)
    if args.insights != "keep":
        api.put("/api/settings", json={"insights": {"enabled": before}})

    lat = {c: (pred_at[c] - cycle_at[c]) * 1000 for c in cycle_at if c in pred_at}
    ins = [api.get(f"/api/insights/{i}").json() for i in insight_ids]
    ins_ms = [i["latencyMs"] for i in ins if i.get("latencyMs")]

    RESULTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    with (RESULTS / f"perf-{stamp}.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["cycle", "scoringMs", "rssMB"])
        for c in sorted(cycle_at):
            w.writerow([c, round(lat[c], 1) if c in lat else "", round(rss[c], 1) if c in rss else ""])
    xs = list(lat.values())
    mem = [rss[k] for k in sorted(rss)]
    summary = [
        f"# System performance — {stamp}", "",
        f"{len(cycle_at)} cycles at {args.speed} s/cycle, insights {'on' if (before if args.insights == 'keep' else args.insights == 'on') else 'off'}; "
        f"wall time {wall / 60:.1f} min.", "",
        "| Measure | Value |", "|---|---|",
        f"| Cycles scored / replayed | {len(lat)} / {len(cycle_at)} |",
        f"| Scoring latency, median | {statistics.median(xs):.0f} ms |" if xs else "| Scoring latency | – |",
        f"| Scoring latency, p90 | {p90(xs):.0f} ms |" if xs else None,
        f"| Scoring latency, max | {max(xs):.0f} ms |" if xs else None,
        f"| Backend memory start → end (max) | {mem[0]:.0f} → {mem[-1]:.0f} MB ({max(mem):.0f} MB) |" if mem else "| Backend memory | not recorded |",
        f"| Insights written | {len(ins)} |",
        f"| Insight latency, median / p90 | {statistics.median(ins_ms) / 1000:.1f} / {p90(ins_ms) / 1000:.1f} s |" if ins_ms else None,
        "", "Scoring latency rising over the run means the predictor fell behind the replay speed "
        "(it catches up in batches); a rising memory line would mean a leak.", "",
    ]
    (RESULTS / f"perf-{stamp}.md").write_text("\n".join(line for line in summary if line is not None))
    print("\n".join(summary))
    print(f"→ eval/results/perf-{stamp}.csv, .md")


if __name__ == "__main__":
    main()
