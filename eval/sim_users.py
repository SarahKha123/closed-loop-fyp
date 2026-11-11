"""Simulation study C1 (docs/dissertation/USER_STUDY_PLAN.md, section 1): LLM agents with
personas carry out the 8 study tasks on the real running system, in both conditions.

These are SIMULATED participants. Report them as such everywhere (plan, rule 1).

Per persona (eval/sim/personas.json) and per block of study.plan(n):
  1. the researcher side starts the task through /api/study (reset → step → pause);
  2. a fresh Playwright browser opens the participant view;
  3. each step: screenshot + persona + task question → vision model → one JSON action;
  4. at most MAX_STEPS steps and MAX_ADVISOR Advisor messages, else "gave up";
  5. /api/study/tasks/end with the answer and correct=None. Scoring happens later, blind.

The agent only sees the screen: never study_scenarios.json or reference answers (rule 6).
The agent model must differ from the account's Advisor model (rule 5); the script refuses otherwise.

    backend/.venv/bin/pip install playwright && backend/.venv/bin/playwright install chromium
    # server running with study mode on (Study page), signed in as an admin:
    backend/.venv/bin/python eval/sim_users.py --user you@gmail.com --agent groq/meta-llama/llama-4-scout-17b-16e-instruct \
        --base http://localhost:5173 --out official
    # dry run (plan 1.8): --personas S01 --out dry

Output in eval/sim/runs/<out>/: config.json (frozen settings), tasks.csv (one row per attempt),
and <persona>/<task>/ with step-NN.png and steps.jsonl. Re-running with the same --out
resumes: finished attempts are skipped. The server's own log (/api/study/export) gets a
row per attempt too, with participant id = persona id (S01…), so it never mixes with P01….
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
for line in (ROOT / ".env").read_text().splitlines() if (ROOT / ".env").exists() else []:
    key, sep, value = line.partition("=")
    if sep and key.strip() and not key.lstrip().startswith("#") and value.strip():
        os.environ.setdefault(key.strip(), value.strip())

from app.services import advisor, auth, cloud, repo, study  # noqa: E402

PERSONAS = ROOT / "eval" / "sim" / "personas.json"
RUNS = ROOT / "eval" / "sim" / "runs"
MAX_STEPS = 15
MAX_ADVISOR = 6
VIEWPORT = {"width": 1280, "height": 800}
ALLOWED = re.compile(r"^/($|components/[a-z]+$|work-orders$|sensors$)")
FIELDS = ["persona", "type", "condition", "taskSet", "taskId", "level", "seed", "steps", "advisorMessages",
          "routes", "gaveUp", "answer", "insightsShown", "chatTurns", "wallMs", "logId", "error", "at"]

SYSTEM = """You are taking part in a usability test of a web dashboard for a hydraulic test rig.
Stay in character as the person below for the whole task.

{profile}

You see one screenshot at a time ({w}x{h} pixels). Answer the task question using only what the
screen shows. Reply with exactly ONE JSON object and nothing else, one of:
  {{"action": "click", "x": <int>, "y": <int>, "why": "<short>"}}
  {{"action": "scroll", "dy": <int, positive = down>, "x": <int>, "y": <int>, "why": "<short>"}}
  {{"action": "goto", "route": "/" | "/components/<cooler|valve|pump|accumulator>" | "/work-orders" | "/sensors", "why": "<short>"}}
{advisor_line}  {{"action": "answer", "text": "<your final answer to the task question>"}}
You have at most {steps} actions. Answer as soon as you are confident."""

ADVISOR_LINE = '  {{"action": "ask_advisor", "text": "<question for the AI Advisor panel>", "why": "<short>"}}\n'


def profile_text(p: dict) -> str:
    return (f"Name: {p['name']}. Age {p['age']}. Role: {p['role']} ({p['experienceYears']} years' experience).\n"
            f"Education: {p['education']}. Uses dashboards: {p['dashboardUse'].lower()}.\n"
            f"Background: {p['profile']}\nHow you work: {p['behaviour']}")


def ask_model(cfg: dict, system: str, history: list[str], question: str, png: bytes, seed: int) -> str:
    img = "data:image/png;base64," + base64.b64encode(png).decode()
    so_far = "\n".join(history) or "(none yet)"
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": [
            {"type": "text", "text": f"Task question: {question}\n\nYour actions so far:\n{so_far}\n\nCurrent screen:"},
            {"type": "image_url", "image_url": {"url": img}},
        ]},
    ]
    for attempt in range(40):  # rate limits (429): wait as the provider says, else back off
        r = httpx.post(f"{cfg['base_url']}/chat/completions", headers=cloud._headers(cfg["provider"], cfg["api_key"]),
                       json={"model": cfg["model"], "messages": messages, "temperature": 0.7, "seed": seed, **cfg.get("extra", {})},
                       timeout=httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0))
        if r.status_code != 429:
            break
        told = re.search(r"try again in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s", r.text)
        if told:  # the provider's own wait, incl. daily caps (Groq: "try again in 10m10.8s")
            h, m, sec = told.groups()
            wait = int(h or 0) * 3600 + int(m or 0) * 60 + float(sec) + 2
            print(f"    rate limit: waiting {wait / 60:.1f} min", flush=True)
            time.sleep(min(wait, 3 * 3600))
            continue
        try:
            wait = float(r.headers.get("retry-after", ""))
        except ValueError:
            wait = 0.0
        time.sleep(min(max(wait, 5.0 * 2 ** attempt), 120.0))
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"] or ""


def parse_action(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    try:
        return json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        return {}


def ask_advisor(page, text: str) -> None:
    page.fill("#advisor-input", text)
    page.press("#advisor-input", "Enter")
    stop = page.get_by_role("button", name="Stop")
    try:
        stop.wait_for(state="visible", timeout=10_000)
    except Exception:  # noqa: BLE001 — a very fast reply may finish before we look
        pass
    stop.wait_for(state="hidden", timeout=150_000)
    page.wait_for_timeout(500)


def run_task(api: httpx.Client, browser, cookie: dict, base: str, cfg: dict, persona: dict,
             condition: str, task_set: str, task: dict, folder: Path) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    ai = condition == "dashboard_ai"
    system = SYSTEM.format(profile=profile_text(persona), w=VIEWPORT["width"], h=VIEWPORT["height"],
                           advisor_line=ADVISOR_LINE.format() if ai else "", steps=MAX_STEPS)
    r = api.post("/api/study/tasks/start", json={"participant": persona["id"], "condition": condition,
                                                 "taskSet": task_set, "taskId": task["id"]}, timeout=120)
    r.raise_for_status()
    ctx = browser.new_context(viewport=VIEWPORT)
    ctx.add_cookies([cookie])
    page = ctx.new_page()
    history: list[str] = []
    routes: list[str] = []
    advisor_msgs, answer, steps, t0 = 0, "", 0, time.monotonic()
    log = (folder / "steps.jsonl").open("w")
    try:
        page.goto(base + "/")
        page.wait_for_timeout(2500)  # SSE keeps the network busy; give the dashboard time to fill in
        for steps in range(1, MAX_STEPS + 1):
            path = urlparse(page.url).path
            if not routes or routes[-1] != path:
                routes.append(path)
            png = page.screenshot()
            shot = folder / f"step-{steps:02d}.png"
            shot.write_bytes(png)
            reply = ask_model(cfg, system, history, task["prompt"], png, persona["seed"])
            act = parse_action(reply)
            kind, note = act.get("action"), ""
            if kind == "answer":
                answer = str(act.get("text", "")).strip()
            elif kind == "click":
                page.mouse.click(int(act["x"]), int(act["y"]))
            elif kind == "scroll":
                page.mouse.move(int(act.get("x", 640)), int(act.get("y", 400)))
                page.mouse.wheel(0, int(act["dy"]))
            elif kind == "goto" and ALLOWED.match(str(act.get("route", ""))):
                page.goto(base + act["route"])
            elif kind == "ask_advisor" and ai and advisor_msgs < MAX_ADVISOR:
                advisor_msgs += 1
                ask_advisor(page, str(act.get("text", "")))
            else:
                note = "rejected: not an allowed action here"
            page.wait_for_timeout(1200)
            if not ALLOWED.match(urlparse(page.url).path):  # clicked into a blocked page: send it back
                page.goto(base + "/")
                page.wait_for_timeout(1500)
                note = "blocked route, returned to /"
            elif kind in ("click", "scroll") and page.screenshot() == png:  # replay is paused: same pixels = no effect
                note = "nothing changed on screen"
            history.append(f"{steps}. {json.dumps(act)}" + (f"  [{note}]" if note else ""))
            log.write(json.dumps({"step": steps, "screenshot": shot.name, "url": urlparse(page.url).path,
                                  "action": act, "modelText": reply, "note": note}) + "\n")
            if answer:
                break
    finally:
        log.close()
        ctx.close()
    wall = int((time.monotonic() - t0) * 1000)
    end = api.post("/api/study/tasks/end", json={"answer": answer, "correct": None}).json()
    return {"steps": steps, "advisorMessages": advisor_msgs, "routes": " ".join(routes), "gaveUp": not answer,
            "answer": answer, "insightsShown": end.get("insightsShown"), "chatTurns": end.get("chatTurns"),
            "wallMs": wall, "logId": end.get("logId")}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--user", required=True, help="an admin account: signs in, and its saved keys run the agent")
    ap.add_argument("--agent", required=True, help="<provider>/<vision model>, e.g. openrouter/google/gemini-2.5-flash")
    ap.add_argument("--base", default="http://localhost:5173", help="where the frontend is served")
    ap.add_argument("--out", required=True)
    ap.add_argument("--personas", default="", help="comma list of persona ids (default: all)")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--no-reasoning", action="store_true",
                    help='send reasoning_effort "none" (Groq Qwen 3): ~20k → ~3k tokens per step on free-tier daily caps')
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    found = repo.user_with_hash(args.user)
    if not found:
        sys.exit(f"no account {args.user!r}")
    user_id = found[0]["id"]
    provider, _, model = args.agent.partition("/")
    if provider not in cloud.PROVIDERS:
        sys.exit(f"unknown provider {provider!r}")
    cfg = cloud.config(user_id, provider, model or None)
    if args.no_reasoning:
        cfg["extra"] = {"reasoning_effort": "none"}
    advisor_label = advisor.choose(user_id).label
    if cfg["model"].lower() in advisor_label.lower():
        sys.exit(f"agent {cfg['model']} is the Advisor's model ({advisor_label}); pick a different one (rule 5)")

    data = json.loads(PERSONAS.read_text())
    wanted = {s.strip() for s in args.personas.split(",") if s.strip()}
    personas = [p for p in data["personas"] if not wanted or p["id"] in wanted]
    tasks = study.tasks()

    out = RUNS / args.out
    out.mkdir(parents=True, exist_ok=True)
    conf = out / "config.json"
    if not conf.exists():
        conf.write_text(json.dumps({
            "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "agent": f"{provider}/{cfg['model']}", "advisor": advisor_label,
            "personasSha256": hashlib.sha256(PERSONAS.read_bytes()).hexdigest(),
            "maxSteps": MAX_STEPS, "maxAdvisor": MAX_ADVISOR, "viewport": VIEWPORT, "temperature": 0.7,
            "extraParams": cfg.get("extra", {}),
            "systemPrompt": SYSTEM, "note": "Simulated participants (LLM agents), not people.",
        }, indent=2))
    table = out / "tasks.csv"
    done = set()
    if table.exists():
        with table.open(newline="") as f:
            done = {(r["persona"], r["taskId"]) for r in csv.DictReader(f) if not r["error"]}

    # Session minted straight in the DB (local script, same trust as the DB file), so Google-only
    # accounts without a password work too. Audited as a normal login with user agent "sim_users".
    token = auth._new_session(found[0], (None, "sim_users"), ("login",))
    with httpx.Client(base_url=args.base, timeout=30, cookies={auth.COOKIE: token}) as api, sync_playwright() as pw:
        if not api.get("/api/settings").json().get("study", {}).get("enabled"):
            sys.exit("study mode is off: turn it on on the Study page first")
        host = urlparse(args.base).hostname
        cookie = {"name": auth.COOKIE, "value": api.cookies[auth.COOKIE], "domain": host, "path": "/"}
        browser = pw.chromium.launch(headless=not args.headed)
        new = not table.exists()
        with table.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new:
                w.writeheader()
            for p in personas:
                for block in study.plan(p["planIndex"])["blocks"]:
                    for task in tasks[block["taskSet"]]:
                        if (p["id"], task["id"]) in done:
                            continue
                        print(f"{p['id']} {block['condition']:<15} {task['id']} …", end=" ", flush=True)
                        row = {"persona": p["id"], "type": p["type"], "condition": block["condition"],
                               "taskSet": block["taskSet"], "taskId": task["id"], "level": task["level"],
                               "seed": p["seed"], "error": "",
                               "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
                        try:
                            row |= run_task(api, browser, cookie, args.base, cfg, p, block["condition"],
                                            block["taskSet"], task, out / p["id"] / task["id"])
                        except Exception as exc:  # noqa: BLE001 — logged and retried on the next run
                            row["error"] = f"{exc.__class__.__name__}: {exc}"[:300]
                            if repo.active_study_task():
                                api.post("/api/study/tasks/end", json={"answer": "", "correct": None})
                        w.writerow(row)
                        f.flush()
                        print(row["error"] or f"{row['steps']} steps{' (gave up)' if row['gaveUp'] else ''}")
        browser.close()


if __name__ == "__main__":
    main()
