# Backend API

Base URL: `http://localhost:8000` (in dev the frontend reaches it through
Vite's `/api` proxy). Interactive docs are generated at `/docs`.

Errors use FastAPI's shape, `{"detail": "human-readable reason"}`, with
`400` for bad input and `503` when what's needed (Ollama, a configured
model) isn't available. Streamed endpoints use server-sent events: each
frame is `data: {json}\n\n`.

---

## Health

### `GET /api/health`
`{"status": "ok"}`

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
  "host": {"os": "Linux", "release": "…-WSL2", "wsl": true, "container": false},
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
everything after it (readings and their predictions); seeking forward skips ahead.

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
| `insight` | the AI produced an insight | the insight | M7 |

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
component's prediction turns Critical (none if one is already open), closed
again with `closedNote: "Condition recovered: …"` when it returns to Optimal.
Priority is High for high-criticality assets (valve, pump), else Medium.

### `POST /api/work-orders`
Body `{"component": "pump", "note": "check seals"}` (`component` may be the key, name or equipment ID).
Raised by a user: `createdBy: "user"`, no triggering prediction. `400` for an unknown component.

### `POST /api/work-orders/{id}/close`
Body `{"note": "seals replaced"}` (optional). `404` if it doesn't exist or is already closed.
Users can close any work order; the monitor only ever auto-closes its own.

---

## Chat

### `POST /api/chat` (SSE)
Body: the full transcript, OpenAI-style.
```json
{"messages": [
  {"role": "system", "content": "You are the Advisor panel…"},
  {"role": "user", "content": "Why is the accumulator flagged?"}
]}
```
The model is whatever `/api/models/active` resolves to; it can't be chosen per request.

Frames:
```json
{"phase": "token", "text": "Gas pre-charge"}
{"phase": "token", "text": " pressure is…"}
{"phase": "done", "model": "qwen3:1.7b"}     // cloud: "openai/<model>"
```
or `{"phase": "error", "error": "…"}` if the model fails mid-reply.
`400` if there's no user message; `503` (before streaming) if no model can answer.
