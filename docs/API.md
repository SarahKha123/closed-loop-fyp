# Backend API

Base URL: `http://localhost:8000` (`BACKEND_PORT`). With `./closed-loop.sh
start` the dashboard is served from the same origin; with `dev` the frontend
reaches it through Vite's `/api` proxy. Interactive docs are generated at `/docs`.

Errors use FastAPI's shape, `{"detail": "human-readable reason"}`, with
`400` for bad input, `404` for an unknown id, `409` when the state doesn't
allow it yet, `502` when a model failed, and `503` when what's needed
(Ollama, a configured model, the dataset) isn't available. Streamed endpoints use server-sent events: each
frame is `data: {json}\n\n`.

---

## Health

### `GET /api/health`
`{"status": "ok"}`

---

## Login (demo)

A session cookie (`closed_loop_session`, HttpOnly). It identifies who is using
the dashboard; no other endpoint requires it. A `demo` / `demo` account is
created on first start; add more with
`backend/.venv/bin/python -m app.services.auth add <username> "<Display Name>"`.

### `GET /api/auth/me`
`{"user": {"id": 1, "username": "demo", "displayName": "Demo Engineer"}}`, or `{"user": null}`.

### `POST /api/auth/login`
Body `{"username": "demo", "password": "demo"}` → `{"user": {...}}` and sets the cookie. `401` if wrong.

### `POST /api/auth/logout`
Ends the session and clears the cookie → `{"user": null}`.

---

## Models (local + selection)

### `GET /api/models`
Installed Ollama models. Never fails because Ollama is down; `error` explains instead.
```json
{
  "models": [
    {
      "name": "qwen3:1.7b",
      "size_bytes": 1359298144,
      "modified_at": "2026-10-06T…",
      "family": "qwen3",
      "parameter_size": "2.0B",
      "quantization_level": "Q4_K_M",
      "embedding": false
    }
  ],
  "error": null
}
```
`embedding: true` marks models that can't chat (the UI hides them, and `auto` skips them).

### `GET /api/models/active`
Which model would answer right now, and why.
```json
{
  "mode": "auto",                  // "auto" | "pinned" | "cloud"
  "tag": "qwen3:1.7b",             // model that will run (cloud: the provider's model id)
  "provider": null,                // cloud provider id when mode is "cloud"
  "resolved": true,                // false = nothing can answer; see reason
  "reason": "largest installed model that fits comfortably in 8GB RAM",
  "config": { "mode": "auto", "pinned": null, "provider": null, "updated_at": null, … },
  "ollama_error": null             // set when Ollama couldn't be listed
}
```

### `POST /api/models/select`
Change the Advisor's model. Body is one of:
```json
{"mode": "auto"}
{"mode": "pinned", "tag": "qwen3:1.7b"}
{"mode": "cloud", "provider": "openai"}
```
Returns the same shape as `/active`. `400` for an unknown mode, a missing
tag, or an unknown provider.

### `GET /api/models/catalogue`
Suggested local models for the Download tab.
```json
{
  "models": [
    {
      "tag": "qwen3:4b",
      "label": "Qwen3 4B",
      "vendor": "Alibaba",
      "params_b": 4.0,
      "est_size_bytes": 2662879723,   // estimate: ~0.62 GB per billion params at Q4
      "note": "Noticeably better answers, still light",
      "installed": false,
      "fits": true                    // within 60% of RAM; null if RAM is unknown
    }
  ],
  "error": null
}
```

### `POST /api/models/pull` (SSE)
Body `{"tag": "llama3.2:3b"}` (any Ollama tag, including `hf.co/user/repo:Q4_K_M`).
Frames:
```json
{"status": "pulling manifest", "percent": null, "done": false}
{"status": "pulling 6a0746a1ec1a", "percent": 42.5, "done": false}
{"status": "success", "percent": null, "done": true}
```
or a final `{"error": "pull model manifest: file does not exist"}`.
Closing the connection cancels the download.

### `POST /api/models/delete`
Body `{"tag": "qwen3:1.7b"}` → `{"ok": true}`. `400` if it isn't installed,
`503` if Ollama is unreachable.

### `GET /api/models/runtime`
Is Ollama itself installed and running (for the first-run dialog).
```json
{"installed": true, "running": false, "binary": "/home/…/config/ollama/bin/ollama", "can_install": true}
```
`binary` is the `ollama` on PATH if there is one, else the copy installed
into `config/ollama/`. `can_install` is `true` on Linux x86-64 / arm64 only.

### `POST /api/models/runtime/install` (SSE)
Downloads Ollama's Linux release and unpacks it into `config/ollama/` (no
sudo), then starts it. Frames are the same shape as a pull —
`{"status": "Downloading Ollama — 512 / 1,400 MB", "percent": 37.0, "done": false}` … `{"status": "Ollama is running", "percent": 100, "done": true}`
— or a final `{"error": "…"}`. One install at a time.

### `POST /api/models/runtime/start`
Starts `ollama serve` if it's installed but not answering, waits up to 20 s,
and returns the `/runtime` object. Its output goes to `config/ollama.log`;
`closed-loop.sh` stops it on Ctrl-C (via `config/ollama.pid`). `503` if it
isn't installed or doesn't come up.

---

## Cloud providers

Provider ids: `openai`, `anthropic`, `google`, `groq`, `openrouter`,
`deepseek`, `custom`. **No response ever includes an API key.**

### `GET /api/cloud`
```json
{
  "providers": [
    {
      "id": "openai",
      "label": "OpenAI",
      "docs": "https://platform.openai.com/api-keys",
      "default_base_url": "https://api.openai.com/v1",
      "base_url": "https://api.openai.com/v1",
      "model": "",
      "has_key": false,
      "key_hint": null,          // e.g. "…5678" once a key is saved
      "ready": false             // key + model + base URL all set
    }
  ]
}
```

### `PUT /api/cloud/{provider}`
Body: any of `{"api_key": "...", "model": "...", "base_url": "https://..."}`.
Omitted fields are left as they are; `""` clears one. Returns `{"providers": [...]}`.
`400` for an unknown provider or a base URL that isn't http(s).

### `DELETE /api/cloud/{provider}`
Removes the saved key, model and URL. Returns `{"providers": [...]}`.

### `POST /api/cloud/{provider}/test`
Calls the provider's `GET /models` with the saved key (costs nothing).
```json
{"ok": true, "detail": "connected — 42 models offered", "models": ["gpt-…", "…"]}
{"ok": false, "detail": "the key was rejected", "models": []}
```

---

## Hardware

### `GET /api/hardware`
```json
{
  "cpu":  {"model": "11th Gen Intel(R) Core(TM) i5-11400H", "arch": "x86_64",
           "cores_physical": 2, "cores_logical": 4, "load_percent": 12.5},
  "ram":  {"total_bytes": 8331214848, "available_bytes": 2439360512},
  "gpu":  {"name": "NVIDIA GeForce RTX 3050 Laptop GPU", "vram_bytes": 4294967296,
           "vram_used_bytes": 0, "driver_version": "571.96", "load_percent": 0.0},  // null if no NVIDIA GPU
  "disk": {"path": "/usr/share/ollama/.ollama/models", "total_bytes": …, "free_bytes": …},
  "host": {"os": "Linux", "release": "…-WSL2", "wsl": true},
  "ollama": {"reachable": true, "version": "0.13.5"},
  "safe_ram_fraction": 0.6
}
```
Under WSL, CPU and RAM are what WSL is allowed to use, not the whole PC.

---

## Replay (live feed)

The 2,205 recorded cycles are replayed one at a time as if arriving live
(see [DATASET.md](DATASET.md) §6). Every control returns the new state and also
publishes it on `/api/stream`. All return `503` if the dataset couldn't be
loaded (the reason is in `detail`); invalid values return `400`.

### `GET /api/replay`
```json
{
  "state": "paused",          // "playing" | "paused" | "finished"
  "cycle": 1673,              // last cycle written; null before the first
  "nextCycle": 1674,          // null when finished
  "first": 1,
  "total": 2205,
  "secondsPerCycle": 2.0
}
```
Starts paused at **cycle 1,665** (the first all-Optimal cycle); after a
restart it resumes after the last stored cycle.

### `POST /api/replay/play` · `/pause` · `/step`
`step` writes exactly one cycle (works while paused). `play` on a finished replay is a `400`.

### `POST /api/replay/speed`
Body `{"secondsPerCycle": 0.5}` — between 0.05 and 60.

### `POST /api/replay/seek`
Body `{"cycle": 600}` — between 1 and 2205. Seeking **back** deletes that cycle and
everything after it (readings, their predictions, and insights about them);
seeking forward skips ahead.

### `POST /api/replay/reset`
Body optional, `{"cycle": 1665}` by default. Pauses, empties the data layer
(readings, predictions, work orders, insights — not equipment) and rewinds.

---

## Live stream

### `GET /api/stream` (SSE)
One long-lived connection per open dashboard; every live event as it happens.
The first frame is always the current replay state. A `: ping` comment is
sent after 15 s of silence to keep the connection open.

| `type` | When | Payload | Since |
|---|---|---|---|
| `replay` | on connect, and after every control | the `GET /api/replay` object | M3 |
| `cycle` | a cycle was written | `{"cycle": 1665, "readingId": 1}` | M3 |
| `prediction` | a cycle was scored | `{"cycle": 733, "predictions": [{"component": "Cooler", "condition": "Degraded", "failureProbability": 0.98, "changedFrom": "Critical", "predictionId": 2917, "equipmentId": "COOLER-1"}, …]}` | M4 |
| `work_order` | a work order opened or closed | `{"action": "opened" \| "closed", "workOrder": {...}}` | M6 |
| `insight` | the AI produced an insight | the insight (as in `GET /api/insights`) | M7 |
| `insight_notice` | the insight engine can't reach a model (sent once, until an insight succeeds) | `{"text": "Insights paused: …"}` | M7 |
| `settings` | runtime settings changed (`PUT /api/settings`, or a study condition switch) | `{"settings": {…}}` — the `GET /api/settings` object | M11 |
| `study` | a study task is loading, has started or has ended | `{"action": "task_loading" \| "task_started" \| "task_ended", "taskId": "A1"}` (`task_loading` has no `taskId`) | M11 |

After the stream reconnects, the browser re-fetches everything (it may have
missed events); there is no replay of missed frames.

```
data: {"type": "replay", "state": "playing", "cycle": 1665, "nextCycle": 1666, "first": 1, "total": 2205, "secondsPerCycle": 0.5}

data: {"type": "cycle", "cycle": 1666, "readingId": 2}
```

---

## Dashboard

All read from the shared data layer. KPIs count only each component's
**latest** prediction (the FYP1 "Critical Asset Count" rule).

### `GET /api/dashboard/overview`
```json
{
  "replay": { "state": "paused", "cycle": 601, … },      // as GET /api/replay
  "replayError": null,
  "predictor": { "trainedAt": "…", "models": { "cooler": "xgboost", "valve": "random_forest", … }, "versionWarnings": [] },
  "predictorError": null,                                 // e.g. "no trained models — run …"
  "cycle": 601,                                           // null before the first scored cycle
  "kpis": { "critical": 2, "degraded": 0, "optimal": 2, "monitored": 4, "openWorkOrders": 0, "avgFailureProbability": 0.5241 },
  "components": [
    {
      "key": "accumulator", "component": "Accumulator", "equipmentId": "ACCUM-1",
      "predictionId": 24, "cycle": 601,
      "condition": "Critical",
      "classProbabilities": { "Optimal": 0.0, "Degraded": 0.001, "Critical": 0.999 },
      "failureProbability": 1.0,                          // P(Degraded) + P(Critical)
      "previousFailureProbability": 1.0,
      "confidence": "High",                               // top class ≥ 0.9 High, ≥ 0.7 Medium
      "shap": [ { "feature": "FS2_mean", "label": "Volume flow 2 (mean)", "unit": "l/min", "value": 8.9509, "contribution": 2.31 }, … ],
      "modelVersion": "xgboost@…",
      "changedFrom": null,                                // previous condition if it just changed
      "since": 595,                                       // first cycle of the current condition run
      "openWorkOrder": null
    }
  ]
}
```
`shap` lists the top 3 features pushing the model *toward the predicted
condition*, with this cycle's actual value. `TrueCondition` (the dataset
label) is never returned.

### `GET /api/dashboard/trend?last=200`
`{"cycles": [402, 403, …], "series": {"Cooler": {"failureProbability": [...], "condition": [...]}, …}}` — aligned arrays, oldest first.

### `GET /api/dashboard/events?limit=30`
Recent condition changes, newest first:
`{"events": [{"cycle": 733, "component": "Cooler", "fromCondition": "Critical", "toCondition": "Degraded", "failureProbability": 0.98}]}`

### `GET /api/dashboard/sensors?cycle=601`
The 17 channels for one cycle (default: latest); `404` before any reading.
```json
{ "cycle": 601, "stable": 0,
  "sensors": [ { "sensor": "CP", "name": "Cooling power", "quantity": "power", "unit": "kW", "rateHz": 1,
                 "mean": 1.49, "std": 0.026, "min": 1.44, "max": 1.53, "relatedComponents": ["Cooler"] }, … ] }
```

---

## Work orders

### `GET /api/work-orders?status=Open|Closed`
`{"workOrders": [{"id": "WO-0001", "component": "Accumulator", "priority": "High", "status": "Open", "createdBy": "system:monitor", "triggeredByPredictionId": 24, "triggeredByCycle": 601, "note": "…", "createdAt": "…", "closedAt": null, …}]}` — newest first.
Automatic work orders come from the monitor (see ARCHITECTURE.md): one when a
component's prediction turns Critical (none if one is already open). A technician
closes them with an outcome; only with `monitor.autoCloseOnRecovery` on (off by
default) does the monitor also close them, with `closedNote: "Condition recovered: …"`,
when the component returns to Optimal.
Priority is High for high-criticality assets (valve, pump), else Medium.

### `POST /api/work-orders`
Body `{"component": "pump", "note": "check seals"}` (`component` may be the key, name or equipment ID).
Raised by a user: `createdBy: "user"`, no triggering prediction. `400` for an unknown component.

### `POST /api/work-orders/{id}/close`
Body `{"finding": "seal wear confirmed", "action": "replaced", "matchedPrediction": "yes", "notes": "…"}`.
`finding`, `action` (`repaired` / `replaced` / `no_action` / `escalated`) and `matchedPrediction`
(`yes` / `no` / `partially`) are required (`422` without them, `400` for an empty finding); `notes` is optional.
`404` if it doesn't exist or is already closed. `closedNote` becomes the finding.

Logs one outcome row (`tbl_WorkOrderOutcome`) with a copy of the work order and of the
prediction behind it: the triggering prediction, or for a manual work order the
component's latest prediction when it was opened. `closedBy` is the logged-in user's
name, or `anonymous`. Outcomes survive replay resets.

### `GET /api/work-orders/history?limit=200`
`{"outcomes": [{"id": 1, "workOrderId": "WO-0009", "component": "Accumulator", "workOrderCreatedBy": "system:monitor",
"openedAt": "…", "closedAt": "…", "closedBy": "Demo Engineer", "finding": "…", "action": "replaced",
"matchedPrediction": "yes", "notes": null, "prediction": {"predictionId": 1068, "source": "trigger", "cycle": 1931,
"condition": "Critical", "failureProbability": 1.0, "topDriver": "Volume flow 2 (mean) = 10.15 l/min"},
"studyMode": false}]}` — newest first. `action` / `matchedPrediction` are null only for a
work order the monitor closed by itself.

### `GET /api/work-orders/outcome-stats`
How often technicians confirmed the model, from verified outcomes outside study mode:
`{"critical": {"total", "yes", "partially", "no", "confirmedRate", "confirmedOrPartialRate"},
"criticalByComponent": [{"component", …same counts}], "allVerified": {…}}`. `critical` counts
outcomes whose prediction was Critical; rates are null with nothing to count.

### `GET /api/work-orders/outcomes.csv`
The whole outcome log as CSV, oldest first (one row per outcome, the prediction flattened into columns).

---

## Chat

### `POST /api/chat` (SSE)
Body: the conversation's user/assistant turns (system messages are ignored —
the backend adds its own prompt with the live snapshot, `services/prompts.py`).
```json
{"messages": [{"role": "user", "content": "Why is the accumulator flagged?"}]}
```
The model is whatever `/api/models/active` resolves to; it can't be chosen per
request. History is capped at `chat.maxTurns` exchanges.

**With tools** (`chat.tools` on, a cycle scored, and a model that accepts
tools) the model may call, up to 3 rounds:

| Tool | Arguments | Returns to the model |
|---|---|---|
| `get_equipment_status` | `component` | condition, since-cycle, failure probability %, confidence, top drivers, open work order |
| `get_history` | `component`, `last_cycles` (1–200, default 50) | runs of the same condition (`periods`), failure probability first/latest/min/max |
| `create_work_order` | `component`, `note` | *nothing is created* — a pending proposal the engineer confirms |

Frames:
```json
{"phase": "tool", "name": "get_history", "args": {"component": "Cooler", "last_cycles": 50}}
{"phase": "confirm", "action": {"id": "59e3f50e928f", "tool": "create_work_order", "component": "Pump",
                                "note": "check the seals", "alreadyOpen": null}}
{"phase": "token", "text": "The cooler has been Critical for the last 50 cycles…"}
{"phase": "done", "model": "qwen3:1.7b", "tools": true, "grounded": true,
 "validation": {"grounded": true, "checked": [{"claim": "96.9%", "ok": true}], "mismatches": []}}
```
With tools the answer arrives as one `token` after the tool rounds; without
tools it streams as many `token`s. `done.tools` is `false` only when the
model refused tools (it then answered from the snapshot alone, and is asked
without tools for the rest of the run). `alreadyOpen` names an open work
order for the same component, if any.

`grounded`/`validation` are `null` when the grounding check is off or nothing
has been replayed yet; tool results count as data the model was given. Each
answer is logged to `tbl_Insight` with `TriggerType = "chat"` (with the
snapshot and tool results). `{"phase": "error", "error": "…"}` if the model
fails mid-reply; `400` unless the last turn is a user message; `503` (before
streaming) if no model can answer.

### `POST /api/chat/confirm`
The engineer's answer to a `confirm` frame. Body `{"id": "59e3f50e928f", "approve": true}`.
```json
{"status": "created", "workOrder": {"id": "WO-0002", "component": "Pump", "createdBy": "user", …}}
{"status": "cancelled"}
```
Approving creates the work order with `createdBy: "user"` and publishes a
`work_order` event. Each proposal can be answered once; `404` for an unknown
or already-answered id (proposals are held in memory, so a restart forgets
them).

---

## Insights

What the Advisor writes by itself on a condition change, a failure probability
crossing `insights.threshold`, or a work order opening/closing. One at a time;
triggers during a generation or the `insights.cooldownSeconds` rest after it
are merged into the next one. Each is grounding-checked and rewritten once if
it fails.

### `GET /api/insights?limit=50`
Newest first, chat answers excluded (unverified ones too when `grounding.hideUnverified`).
```json
{"insights": [{"id": 1, "createdAt": "…", "cycle": 3, "triggerType": "work_order",
  "triggerRef": "Work order WO-0001 opened for Cooler", "model": "qwen3:1.7b", "mode": "local",
  "promptVersion": "insight-v1", "text": "The Cooler changed to Critical…", "grounded": true,
  "validation": {"grounded": true, "checked": [{"claim": "WO-0001", "ok": true}], "mismatches": []},
  "attempts": 2, "latencyMs": 30926, "firstTokenMs": 16171}]}
```
`triggerType`: `condition_change` · `threshold` · `work_order` · `multiple` · `manual`.

### `GET /api/insights/{id}`
One insight plus the `snapshot` it was written from. `404` if unknown.

### `POST /api/insights/generate`
"Summarise now" — waits for the model and returns the new insight (also sent
on the stream). `503` no model · `409` nothing scored yet · `502` the model failed.

---

## Settings

Runtime toggles, saved to `config/settings.json` (overrides only) and applied
to the next event — no restart. What each one does: [DEVELOPMENT.md](DEVELOPMENT.md#runtime-settings-configsettingsjson).

### `GET /api/settings`
```json
{"insights":  {"enabled": true, "threshold": 0.5, "cooldownSeconds": 10},
 "grounding": {"enabled": true, "hideUnverified": false},
 "monitor":   {"confirmCycles": 1, "autoCloseOnRecovery": true},
 "chat":      {"maxTurns": 10, "tools": true},
 "study":     {"enabled": false, "condition": "dashboard_ai"}}
```

### `PUT /api/settings`
A partial patch, e.g. `{"insights": {"enabled": false}}`; returns the full
settings. `400` on an unknown key, wrong type or out-of-range value (nothing
is saved). Ranges: `insights.threshold` 0.05–0.95, `insights.cooldownSeconds`
0–600, `monitor.confirmCycles` 1–20, `chat.maxTurns` 1–50; `study.condition`
is `dashboard_only` or `dashboard_ai`. Every change is also published as a
`settings` event, so open dashboards apply it at once.

---

## Study

The technical side of the user study (M11, `services/study.py`). Study mode
itself is `study.enabled` in the settings; the researcher works at
`/study/admin`. Tasks come from `config/study_scenarios.json`: two parallel
sets, `A` and `B`, of four tasks each. `400` (with the reason) for anything
that can't be carried out — an unknown task, a task already running, no task
running, a bad participant number.

### `GET /api/study`
```json
{"settings": {"enabled": true, "condition": "dashboard_ai"},
 "taskSets": {"A": [{"id": "A1", "level": "lookup", "from": 200, "to": 214,
                     "prompt": "Which components are in Critical condition right now?",
                     "answer": "Cooler, Pump and Valve (the Accumulator is Optimal)."}, …],
              "B": [ … ]},
 "active": null}                     // the running task's log row, or null
```
`answer` is the researcher's reference answer; the participant's screen never shows it.

### `GET /api/study/plan/{n}`
Counterbalancing: participant `n` (1, 2, …) gets one of the four orders of
condition × task set, in rotation.
```json
{"participant": "P03",
 "blocks": [{"condition": "dashboard_ai", "taskSet": "A"}, {"condition": "dashboard_only", "taskSet": "B"}]}
```

### `POST /api/study/condition`
Body `{"condition": "dashboard_only"}`. Sets `study.condition` and turns
insights off (`dashboard_only`) or on (`dashboard_ai`) together; returns the
full settings and publishes a `settings` event.

### `POST /api/study/tasks/start`
Body `{"participant": "P03", "condition": "dashboard_ai", "taskSet": "A", "taskId": "A1"}`.
Switches the condition, publishes `study`/`task_loading` (the participant's
chat clears), resets the replay to the task's `from` cycle (emptying the data
layer — `tbl_StudyLog` is kept), steps to `to`, waits until that cycle is
scored, and only then starts the clock. Returns the new log row:
```json
{"logId": 7, "participantId": "P03", "condition": "dashboard_ai", "taskSet": "A", "taskId": "A1",
 "startedAt": "2026-10-18T09:12:03.120+00:00", "endedAt": null, "durationMs": null,
 "answer": null, "correct": null, "chatTurns": null, "insightsShown": null}
```
Can take a few seconds (the preset replays up to ~15 cycles).

### `POST /api/study/tasks/end`
Body `{"answer": "Cooler and pump", "correct": true}` (`correct` may be
`null` — mark it later from the export). Stops the clock and fills
`endedAt`, `durationMs`, `chatTurns` (chat answers during the task) and
`insightsShown`. Returns the finished row and publishes `study`/`task_ended`.

### `GET /api/study/log?participant=P03`
`{"log": [ …rows as above… ]}` — all participants, or one.

### `GET /api/study/export?participant=P03`
The same rows as CSV (`study-log.csv` / `study-log-P03.csv`), with the
columns `LogID, ParticipantID, Condition, TaskSet, TaskID, StartedAt,
EndedAt, DurationMs, Answer, Correct, ChatTurns, InsightsShown`.
