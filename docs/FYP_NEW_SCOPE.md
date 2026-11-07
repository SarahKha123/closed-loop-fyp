# FYP — Revised Topic and Content

> **What this is:** the realigned version of the FYP, replacing the Microsoft
> Power Platform / Copilot Studio plan in the FYP1 interim report. It goes
> through the report section by section: what stays, what changes, and the
> new content (written out where it's short, as key points where it's a
> chapter). Use it to rewrite the report and to brief the supervisor.
>
> **Student:** Sarah Khalilah binti Mohd Fauzi (22005955)
> **Supervisor:** AP Ts Dr Mohd Anuaruddin bin Ahmadon
> **Programme:** Bachelor of Information Technology (Hons), UTP
>
> The implementation plan and tracker is the root [TODO.md](../TODO.md).
>
> **Revision, 7 Nov 2026 — cloud-only.** The system is now deployed, so local
> models (Ollama) were removed and the Advisor runs on cloud providers only.
> The title, RQ2 and every "local vs cloud" passage below were changed to a
> **small vs large cloud model** comparison. Confirm the new title and RQ2
> with the supervisor before rewriting the report.

---

## 0. The change in one page

| | FYP1 interim report | Now |
|---|---|---|
| **Title** | Design and Development of an Agentic AI-Driven Predictive Maintenance Analytics and Workflow Automation System Using Microsoft Copilot Studio | Design and Development of a Web-Based Predictive Maintenance Dashboard with Live, Data-Grounded AI Insights Using Cloud Language Models |
| **Platform** | Power BI, Power Automate, Copilot Studio, Dataverse/SharePoint, Teams | Self-built web system: React dashboard, FastAPI backend, SQLite, OpenAI-compatible cloud LLMs (any provider) |
| **Where the AI sits** | A chat agent in Teams that answers when asked (designed, not built) | Inside the dashboard: it speaks first when the data changes (live insights) and answers questions (chat) |
| **AI model** | Copilot Studio (cloud only, Microsoft-hosted) | Any OpenAI-compatible provider and model (OpenAI, Anthropic, Gemini, Groq, …), switchable without code changes |
| **Data flow** | Batch: offline scoring, CSV upload, 15-minute polling | Live: the 2,205 cycles replayed as a stream, scored on arrival, dashboard and AI update immediately |
| **New research angle** | Agent vs dashboard | (1) AI embedded in the dashboard vs dashboard alone, (2) **grounding**: does the AI only state values that are actually in the data, (3) **small vs large model** trade-off |
| **Unchanged** | UCI hydraulic dataset, 68-feature pipeline, RF/XGBoost models (macro-F1 0.982–0.999), SHAP, CRISP-DM, the four data tables, the user-study design (SUS, NASA-TLX) | Same — all carried over |

**Why the change is justified (say this to the supervisor):**

1. **It removes the project's biggest risk.** The interim report itself
   (Section 3.2, Chapter 5) stated that Dataverse premium licensing, Copilot
   Studio licences and Teams admin permissions had to be validated with UTP IT,
   and that trial tenants might block them. A self-built system has no
   tenant dependency.
2. **The agent actually gets built.** In FYP1 the agent was "design only".
   Now the AI layer is implemented, measured and evaluated.
3. **It closes a limitation the report admitted.** "Batch-mode scoring is an
   explicitly acknowledged limitation… a live scoring endpoint is planned as
   an FYP2 extension" (Section 1.4). Live replay delivers that.
4. **It adds a contribution the old platform couldn't.** Copilot Studio fixes
   the model, so there was no way to compare models. Here any OpenAI-compatible
   provider and model can be switched in, so whether a small, cheap model
   explains the data as accurately as a large one is a real, evaluable
   question — and it decides what the system costs to run.
5. **Nothing from FYP1 is wasted.** Every FYP1 component maps onto a new one
   (Section 3.3 below).

---

## Title page

**New title (recommended):**
> **Design and Development of a Web-Based Predictive Maintenance Dashboard with Live, Data-Grounded AI Insights Using Cloud Language Models**

Alternatives, if a shorter one is preferred:
- *Closed Loop: A Predictive Maintenance Dashboard with Grounded LLM Insights*
- *An LLM-Augmented Predictive Maintenance Dashboard for Hydraulic Systems*

Keep "predictive maintenance" and "hydraulic" visible; they connect it to the approved FYP1.

---

## Abstract (rewrite in full)

> Condition monitoring and predictive maintenance have become increasingly
> important in smart manufacturing, where a fault in one component of a
> hydraulic circuit can cascade into costlier failures elsewhere. Current
> tools fall into two groups: dashboards that leave users to extract, compare
> and interpret visual data themselves, and machine learning models that
> predict failures without communicating or acting on them. Neither closes the
> loop from detection to action, and the burden of interpretation falls on
> maintenance staff who may not have an analytics background.
>
> This project addresses that gap with a self-hosted, web-based predictive
> maintenance system in which prediction, visual analytics, AI-generated
> insight and maintenance workflow operate on a single shared data layer.
> Sensor data is ingested and scored by validated machine learning models; the
> results drive an overview dashboard; a large language model (LLM) watches the
> same data and proactively explains what changed and why, in plain language;
> and critical predictions automatically raise maintenance work orders. The
> LLM is reached through any OpenAI-compatible cloud provider, so the model can
> be changed without changing the system. Every AI statement is grounded in a structured snapshot of the
> dashboard, and a validator checks the values it reports against the data.
>
> The system is built and evaluated on the UCI Condition Monitoring of
> Hydraulic Systems dataset: 2,205 load cycles from 17 sensors on a physical
> test rig, replayed as a live stream. Across the four monitored components
> (cooler, valve, pump, accumulator), the best models achieved a
> cross-validated macro-F1 of 0.982–0.999 and a macro PR-AUC of 0.997–1.000,
> against 0.42–0.56 for a rule-based baseline (paired t-test, p < 0.0001).
> SHAP attribution identified physically meaningful drivers, such as maximum
> cooling power for cooler condition, and these drivers become the
> explanations the AI gives.
>
> Evaluation covers three parts: (A) predictive performance, (B) the quality of
> AI insights — grounding accuracy, latency, and a comparison of small and
> large language models — and (C) a within-subjects user study comparing the dashboard
> alone against the dashboard with AI insights, measured by task accuracy,
> completion time, the System Usability Scale and NASA-TLX.

*(Update the last paragraph with real Part B/C results at the end of FYP2.)*

---

## Chapter 1: Introduction

### 1.1 Background — mostly keep

**Keep:** hydraulic components are coupled; the cost of a fault grows with
time; condition-based and predictive maintenance; prediction alone isn't
enough unless it is communicated and acted on.

**Change:** the last paragraph. Replace the Power Platform description with:

> This project implements such a system as a self-hosted web application. It
> combines machine learning failure prediction, an interactive overview
> dashboard, a large language model that generates live, data-grounded
> insights and answers questions, and automated maintenance work orders. All
> of these share one data layer, so the dashboard, the AI and the workflow
> always describe the same state of the equipment. The language model is a
> hosted cloud model behind one standard interface, so a cheaper or more
> capable model can be swapped in without changing the system.

**Add:** a short paragraph on model choice in industry — hosted LLMs differ
widely in cost and latency, and a monitoring system calls one on every event,
so the smallest model that stays accurate matters. *[ADD SOURCE on LLM
cost/size trade-offs.]*

### 1.2 Problem Statement — keep the first three paragraphs, reframe the last, add a fifth

Problems, as numbered points (useful for the slides too):

1. **Reactive or schedule-based maintenance** delays the response to faults
   (Jardine et al., 2006; Carvalho et al., 2019). *Keep.*
2. **Coupled components** mean one undetected fault spreads; detection must be
   tied to action (Christou et al., 2020). *Keep.*
3. **Disconnected tools.** Dashboards, predictive tools and alerting
   typically don't share data (Bousdekis et al., 2018; Jiang & Hu, 2025).
   *Keep.*
4. **Dashboards make the user do the interpreting.** Reading charts, comparing
   values and finding causes is a cognitive load that falls on technicians.
   Figliè et al. (2026) found an LLM agent reduced perceived workload but was
   compared *against* a dashboard rather than built *into* one. *Reframe:* the
   problem is now "the dashboard doesn't explain itself", not "there's no chat
   agent".
5. **New — trust and placement of the AI.** LLMs can state plausible but wrong
   values (hallucination), which is unacceptable when they describe equipment
   condition. Existing work rarely checks LLM statements against the
   underlying data, or asks how small a model can be before its explanations
   become unreliable. *[ADD SOURCE: Ji et al. 2023, "Survey of
   Hallucination in Natural Language Generation" — verify before citing.]*

### 1.3 Objectives — rewrite

**General objective:**
> To design, develop and evaluate a web-based predictive maintenance system in
> which machine learning prediction, an overview dashboard, data-grounded AI
> insights from a cloud language model, and automated maintenance
> workflows operate as a single closed loop on a shared data layer.

**Specific objectives:**

- **O1 — Predict.** To develop a machine learning failure-prediction model on
  real multi-sensor hydraulic data, addressing class imbalance, benchmarked
  against a rule-based baseline, and explained with SHAP feature attribution.
  *(Same as FYP1, plus SHAP for all four components.)*
- **O2 — Build.** To design and implement a web-based closed-loop system that
  ingests sensor data, scores it, presents it as a live dashboard, generates
  grounded natural-language insights with a switchable cloud language model, and raises maintenance work orders automatically and on request.
- **O3 — Evaluate.** To evaluate (A) predictive performance against the
  baseline, (B) the grounding accuracy, latency and small-versus-large model
  trade-off of the AI insights, and (C) the effect of AI insights on users'
  task accuracy, completion time, usability and workload compared with the
  dashboard alone.

**Research questions (new — optional but strengthens Chapter 5):**

- **RQ1.** Do live, data-grounded AI insights improve task accuracy and reduce
  workload compared with the same dashboard without them?
- **RQ2.** How closely can a small, low-cost cloud language model match a large
  one in grounding accuracy and latency for explaining predictive maintenance
  data?
- **RQ3.** How much does supplying the AI with a structured data snapshot and
  validating its output reduce incorrect values in its statements?

**Table 1.1 — Objectives to deliverables (replace):**

| Objective | FYP1 deliverable (done) | FYP2 deliverable |
|---|---|---|
| O1 Predict | Feature pipeline; models evaluated vs baseline (stratified CV); SHAP for Cooler | SHAP for all 4 components; models served by the backend for live scoring |
| O2 Build | Architecture and four data contracts designed; Power BI prototype dashboard | Web system built: ingestion + replay, prediction service, live dashboard, AI insight engine with grounding validator, chat with actions, work-order automation, cloud provider and model switching |
| O3 Evaluate | Part A executed; Parts B/C designed | Part B (AI quality, small vs large model) executed; Part C user study (N≈20, within-subjects) executed and analysed |

### 1.4 Scope of Study — rewrite

**In scope:**
- Four hydraulic components: cooler, valve, pump, accumulator.
- The UCI Condition Monitoring of Hydraulic Systems dataset (2,205 cycles, 17 sensors).
- **Live replay** of recorded cycles as a stream, with scoring on arrival.
- A self-hosted web application: dashboard, AI insight feed, chat, work orders.
- Cloud language models through OpenAI-compatible APIs (any provider).
- Grounding validation of AI-generated statements.
- A single-site, single-user deployment (one operator at a time).

**Out of scope:**
- Live connection to physical plant sensors (replay stands in for them).
- Equipment beyond the four hydraulic components.
- Multi-user accounts, roles and authentication.
- Training or fine-tuning language models (they are used as provided).
- Automatically building models for arbitrary uploaded datasets.
- Production deployment on factory infrastructure.

**Note on limits (keep the honest tone of FYP1):** replay demonstrates the
live pipeline with real recorded data but is not live plant telemetry; the
AI layer depends on a third-party provider being reachable, and the
current readings are sent to it with every request.

---

## Chapter 2: Literature Review — keep most, replace 2.6, add two sections

| Section | Action | Notes |
|---|---|---|
| Intro paragraph | Edit | "ten sources from seven topics" → update counts; drop "low-code agents" from the list |
| 2.1 CBM and PdM foundations | **Keep** | Jardine 2006; Carvalho 2019; El Hammoumi 2025 |
| 2.2 ML for fault prediction (hydraulic) | **Keep** | Jamshidi 2025; Song 2023 |
| 2.3 Agentic AI in maintenance | **Keep, reframe** | Jiang & Hu 2025; Di Maggio 2025. Link Di Maggio's "value is in informational and decision-support capabilities" to the insight feed; link "autonomy needs governance" to keeping the AI's actions limited (it can only create work orders, and every one is logged with who created it). |
| 2.4 AI decision support and actionable maintenance | **Keep** | Soori 2024; Christou 2020. Point out that the closed loop is now implemented, not designed. |
| 2.5 Conversational vs dashboard decision support | **Keep, extend** | Figliè 2026 is now the central reference: they compared the two *separately*; this project *combines* them and tests whether that keeps the speed benefit without losing accuracy. |
| 2.6 Industry practice: low-code agent platforms | **Replace** with **2.6 AI-generated insights in analytics tools** | Industry BI tools now add AI summaries to dashboards (e.g. Copilot in Power BI). Use this to show the direction is mainstream, and that those tools are cloud-only and don't expose grounding checks. *[ADD SOURCE — vendor documentation is acceptable if labelled "not peer-reviewed", as FYP1 did.]* Keep the Microsoft scenario library reference here as industry context. |
| **2.7 (new) LLM hallucination and grounding** | **Add** | Why LLMs state wrong facts; grounding the model in retrieved or supplied data (retrieval-augmented generation: Lewis et al., 2020, NeurIPS); structured data-to-text. This underpins the snapshot + validator design. *[Verify Lewis 2020 and Ji 2023; add 1–2 more.]* |
| **2.8 (new) Model size and cost** | **Add** | Small vs large language models (e.g. Llama 8B vs 70B, GPT-OSS 120B); the quality/latency/cost trade-off; sending operational data to hosted APIs. *[ADD 2–3 SOURCES.]* |
| 2.9 Evaluation instruments (old 2.7) | **Keep** | SUS (Brooke 1996); NASA-TLX (Hart & Staveland 1988). Add grounding accuracy as a system-level metric. |
| 2.10 Research gap (old 2.8) | **Rewrite** | See below |

**Research gap (rewrite):**

> Condition-based maintenance, hydraulic fault classification, agentic AI,
> actionable decision support and conversational versus dashboard interaction
> have each been studied, but largely in isolation. Christou et al. (2020)
> demonstrate a closed loop without a natural-language layer; Jiang and Hu
> (2025) and Di Maggio (2025) describe agentic patterns that were not
> evaluated against a dashboard on real hydraulic data; Figliè et al. (2026)
> compare conversational and graphical decision support as alternatives rather
> than combining them, and in a general rather than model-backed context.
> Commercial dashboards now add AI summaries, but they run on cloud models and
> do not verify the values they state. No work combines a validated
> predictive model on real data, a dashboard with proactive AI insights whose
> statements are checked against the data, an automated alert-to-action
> workflow, and a measured choice of model size, evaluated end-to-end against
> a dashboard-only baseline. O1 establishes the predictive foundation, O2
> builds the grounded closed loop, and O3 measures what the AI layer adds and
> how small a model can be while staying accurate.

---

## Chapter 3: Methodology

### 3.1 CRISP-DM — keep, update two phases

- Keep the figure and the honest account of the split-methodology mistake.
- **Modelling:** unchanged.
- **Deployment:** "batch scoring into Dataverse / Power BI" → "models served
  by the backend; each replayed cycle is scored on arrival and written to the
  shared database, which the dashboard, AI and workflow read."
- Optional: note that the AI layer gets its own build–measure loop (prompt
  and validator changes are evaluated against the Part B scenario set before
  being kept).

### 3.2 System Architecture — replace

**Key point to state first:** the FYP1 hub-and-spoke idea is kept. The hub is
still one shared data layer and every module is a consumer of it. Only the
technology changes.

```
                         ┌──────────────────────────────┐
  UCI dataset files ───► │ Ingestion + replay           │  one cycle at a time, at a chosen speed
                         └──────────────┬───────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │ Prediction service           │  68 features → RF/XGBoost → condition,
                         │ (FYP1 models)                │  probability, SHAP top drivers
                         └──────────────┬───────────────┘
                                        ▼
        ┌──────────────── SHARED DATA LAYER (SQLite) ─────────────────┐
        │ tbl_Equipment · tbl_SensorReading · tbl_Prediction ·        │
        │ tbl_WorkOrder · tbl_Insight (new)                           │
        └──┬─────────────────┬──────────────────┬─────────────────┬───┘
           ▼                 ▼                  ▼                 ▼
     Dashboard (React)   Monitor worker     Insight engine     Advisor chat
     live via SSE        → work orders      → snapshot → LLM   → tools: status,
                         (system)           → validator → feed   create work order (user)
                                                 │
                                    Cloud LLM (OpenAI-compatible)
```

**Five layers (rewrite of the FYP1 list):**

1. **Ingestion:** reads the UCI raw files, replays cycles in order at a
   configurable speed, and writes each to `tbl_SensorReading`. *(Replaces
   FL_IngestReadings and SharePoint.)*
2. **Intelligence:** the FYP1 feature pipeline and trained models, loaded
   once and called per cycle; output plus SHAP top drivers written to
   `tbl_Prediction`. *(Replaces offline batch scoring and the planned Azure ML
   endpoint.)*
3. **Analytics:** the web dashboard — overview KPIs, component health, risk
   trends, sensor feed, work orders — updated live. *(Replaces Power BI.)*
4. **Insight and conversation:** the insight engine (proactive) and the
   Advisor chat (on request), both on a switchable cloud model, both
   grounded and validated. *(Replaces the Copilot Studio agent.)*
5. **Automation:** the monitor worker raises work orders when a component
   becomes Critical; the Advisor can raise one on request. *(Replaces
   FL_MonitorRisk and FL_CreateWorkOrder.)*

### 3.3 Mapping FYP1 → FYP2 (new table; show this to the supervisor)

| FYP1 (Power Platform) | FYP2 (web system) | What carries over |
|---|---|---|
| Python feature extraction + RF/XGBoost + SHAP | Prediction service | The code and trained models, unchanged |
| Dataverse / SharePoint lists | SQLite database | The four table designs (Tables 3.1–3.3), unchanged |
| Power BI dashboard | React dashboard | The same visuals: KPI tiles, component health, risk trend, detail table |
| Critical Asset Count (DAX) | Same measure computed in the API | The "latest reading per equipment" rule from Section 3.2 |
| FL_IngestReadings | Ingestion + replay | — |
| FL_MonitorRisk (15-min polling) | Monitor worker (on each new prediction) | Threshold logic |
| FL_CreateWorkOrder (system-invoked) | Work-order service, `CreatedBy = "system:monitor"` | Audit trail via `TriggeredByPredictionID` |
| FL_CreateWorkOrder (Copilot-invoked) | Advisor chat tool, `CreatedBy = "user"` | The dual invocation path — the "agentic" behaviour |
| FL_GetEquipmentStatus | Advisor chat tool `get_equipment_status` | Same action contract |
| Copilot Studio (design only) | Insight engine + Advisor (built) | Topic map → tool list; fault explanation from SHAP |
| Teams / Outlook alerts | Live insight feed + in-app notifications | — |

### 3.4 Data contracts — keep Tables 3.1–3.3, add one table

Keep `tbl_Equipment`, `tbl_SensorReading`, `tbl_Prediction`, `tbl_WorkOrder`
as designed. Changes:

- `tbl_Prediction`: add `ShapTopFeatures` (JSON: the top 3 features and their
  contributions), so explanations need no recomputation.
- `tbl_WorkOrder.CreatedBy`: values `system:monitor` or `user` (no Entra ID
  now that there are no Microsoft accounts).
- **New `tbl_Insight`:** `InsightID`, `CreatedAt`, `TriggerType` (state change
  / threshold / periodic summary / chat), `TriggerRef` (PredictionID or
  WorkOrderID), `Model` (e.g. `groq/llama-3.3-70b-versatile`), `Mode`
  (always `cloud` now; older rows may say `local`), `Text`, `Grounded` (bool), `ValidationDetail` (JSON: each value
  checked and whether it matched), `LatencyMs`. This table *is* the dataset
  for Part B.

### 3.5 The AI layer (new section — the technical core of FYP2)

**3.5.1 Triggers (when the AI speaks first):**
- A component's predicted condition changes (e.g. Degraded → Critical).
- A work order is opened or closed.
- Failure probability crosses a threshold.
- An optional periodic summary ("since the last summary…").

**3.5.2 Grounding: the snapshot.** The AI never sees raw sensor files. It
receives a compact JSON snapshot of exactly what the dashboard shows: cycle
number, each component's condition, probability and change since the last
cycle, the SHAP top drivers with sensor values, and open work orders. The
prompt tells it to use only these values.

**3.5.3 Validation.** After generation, a validator extracts every number,
component name and condition from the text and checks it against the
snapshot (with a small tolerance for rounding). If something doesn't match,
the insight is regenerated once; if it still fails, it is shown with a
warning or dropped. Every check is logged in `tbl_Insight`.

**3.5.4 Cloud models.** One client for every provider: OpenAI, Anthropic,
Gemini, Groq, OpenRouter, DeepSeek and Ollama Cloud all speak the
OpenAI-compatible chat API. Each signed-in user chats on their own key and
model, saved encrypted against their account on the AI model page; the live
insights, which belong to no one user, use the server's key from its
environment.
*(Already implemented in this repo.)*

**3.5.5 Chat with actions.** The Advisor answers questions using the same
snapshot, and can call two tools: `get_equipment_status(component)` and
`create_work_order(component, note)`. Work orders created this way record
`CreatedBy = user`, completing the dual invocation path from FYP1.

### 3.6 Dataset and data preparation — keep as-is

Keep the dataset choice argument (AI4I/C-MAPSS rejected as simulated,
CWRU/IMS as vibration-only), Tables 3.6 and 3.7, and the 68-feature
description. **Add one paragraph on replay:** cycles are replayed in their
recorded order at a configurable rate (e.g. one cycle every 2 seconds), each
treated as newly arrived data.

### 3.7 Tools and platform — replace Table 3.8

| Tool | Role |
|---|---|
| Python, scikit-learn, XGBoost, imbalanced-learn, SHAP | Feature extraction, model training, explanation (FYP1) |
| FastAPI | Backend API, ingestion, prediction service, workers, server-sent events |
| SQLite | Shared data layer (the four contracts + insights) |
| React, TypeScript, Vite, Tailwind CSS, TanStack Router | Web dashboard |
| OpenAI-compatible APIs | Cloud language models (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, Ollama Cloud) |
| Bash (`closed-loop.sh`) | One-command setup and start on a single machine; no containers, so it runs on a 4-core, 8 GB laptop |
| Git / GitHub | Version control |

**Justification paragraph (add):** a self-built stack removes licensing and
tenant dependencies, makes every layer inspectable and measurable (needed for
Part B), and lets the language model be swapped by configuration, which a
managed platform does not.

### 3.8 Evaluation methodology (move out of Chapter 5 references; the report cited "Section 5.1–5.3" that didn't exist)

**Part A — Predictive performance (done):** repeated stratified 5-fold CV ×3
seeds; macro-F1, macro PR-AUC, per-class recall, confusion matrices; paired
t-test and Cohen's d against the rule-based baseline.

**Part B — AI insight quality (new):**
- **Scenario set:** 30–50 fixed snapshots drawn from real replayed cycles,
  covering every component going Degraded/Critical, recoveries, multiple
  simultaneous faults, and all-clear.
- **Models:** at least one small and one large cloud model (e.g. Llama 3.1 8B
  and Llama 3.3 70B on Groq, plus GPT-OSS 120B, already run); same prompts,
  same snapshots.
- **Metrics:**
  - *Grounding accuracy:* the share of stated values that match the snapshot
    (automatic, from the validator).
  - *Hallucination rate:* the share of insights with at least one wrong value.
  - *Coverage:* did it mention the component that changed (automatic).
  - *Usefulness:* rated 1–5 by two raters on a fixed rubric (manual, on a sample).
  - *Latency:* time to first token and total time.
  - *Validator effect:* the above with and without the validator/regeneration step (RQ3).
- **Analysis:** compare models per metric; report the trade-off as a table and chart.

**Part C — User study (designed in FYP1; update the conditions):**
- Within-subjects, N ≈ 20, counterbalanced order.
- **Condition 1:** dashboard only (AI feed and chat hidden — the app has a toggle).
- **Condition 2:** dashboard + AI insights + chat.
- **Tasks:** graded from simple lookup ("Which component is critical?") to
  diagnosis ("Why did the cooler degrade, and what should be done?") —
  mirroring Figliè et al.'s complexity levels.
- **Measures:** task accuracy, completion time, SUS, NASA-TLX, plus a short
  trust question.
- **Analysis:** paired t-test or Wilcoxon signed-rank per measure; effect sizes.
- **Ethics:** submit for approval at the start of FYP2.

**Part D — System performance (light):** end-to-end latency from a cycle
arriving to the dashboard updating and the insight appearing; stability over
a full 2,205-cycle replay.

---

## Chapter 4: Results and Discussion

| Section | Action |
|---|---|
| 4.1 Data preparation results | **Keep** (2,205 × 68, class distribution Table 4.1) |
| 4.2 ML model results | **Keep** (Table 4.2, Cooler confusion matrices, SHAP). Add SHAP for valve, pump, accumulator. |
| 4.3 Dashboard development | **Replace** Power BI screenshots with the web dashboard (overview, component health, risk trend, sensor feed, work orders). Keep the "what question it answers" captions — they were good. Explain the replay timeline instead of the May–Jul 2026 dates (the dataset has no dates). |
| 4.4 (new) AI insight layer | Screenshots of the live feed and chat; an example insight with its validation record; the AI model page (providers, Advisor behaviour). |
| 4.5 (new) Part B results | Grounding accuracy, hallucination rate, latency per model; validator effect. |
| 4.6 (new) Part C results | User study results. |
| 4.7 Progress against objectives | **Rewrite** Table 4.4 with O1/O2/O3 as revised. |

---

## Chapter 5: Conclusion and Future Work

**Key points to rewrite:**
- Restate the closed loop: data → prediction → dashboard → grounded AI insight → action, on one data layer.
- Summarise O1 (done in FYP1), O2 (built), O3 (A, B, C results).
- Answer RQ1–RQ3 directly.
- **Limitations:** replay rather than live plant data; one dataset and four
  components; dependence on a third-party model provider; a single-user system; a
  small user study sample.
- **Future work:** live sensor connection (e.g. MQTT/OPC-UA); more equipment
  types and datasets; multi-user roles and authentication; an on-premise model
  for sites that can't send data out; notifications to Teams/email; remaining-useful-life
  regression in addition to condition classification.

---

## References

**Keep all 16 from FYP1.** Add, after verifying each one:
- Lewis, P., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *NeurIPS.*
- Ji, Z., et al. (2023). Survey of hallucination in natural language generation. *ACM Computing Surveys.*
- 2–3 sources on LLM size, cost and quality trade-offs. *[TO FIND]*
- 1–2 sources on AI-generated insights / data-to-text for dashboards. *[TO FIND]*
- Documentation for the providers and models used (as non-peer-reviewed tool references).

---

## Fixes to carry over from the FYP1 report

- [ ] Table of contents shows "Error! Bookmark not defined" (3.3, Chapter 4, 4.1, 4.2) and wrong page numbers (3.4 → "95", 4.3 → "168", 4.4 → "189") — update all fields.
- [ ] Broken cross-references to an evaluation chapter that doesn't exist: 2.2 and 2.7 say "Chapter 5"; the Chapter 4 intro and 4.1 say "Section 5.1"; Chapter 5 says "section 5.2" and "5.3". Point them all at the new Section 3.8.
- [ ] The Power BI risk trend is labelled May–Jul 2026, but the dataset has no dates — use cycle numbers.
- [ ] The DAX measure and "Teams-tagging" wording go; keep the *logic* (latest reading per equipment) in prose.
- [ ] Section 3.2.2's Teams/@mention flow is replaced by the in-app chat.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Supervisor or coordinator doesn't approve the title/platform change | Medium | Present Section 0 and the mapping table (3.3); emphasise continuity and the removed licensing risk |
| Small models give weak or wrong insights | High | That's a finding, not a failure (RQ2); the validator catches wrong values; a larger model as fallback |
| LLM states wrong values | Medium | Snapshot grounding + validator + regenerate-once; log everything |
| Scope creep ("take in any data") | Medium | Fixed schema; hydraulic dataset is the case study; generic ingestion only as a stretch goal |
| FYP1 model code not in this repo | — | Milestone 1 brings it in first |
| User study recruitment / ethics delay | Medium | Submit ethics in week 1; pilot with 2–3 people; N=12 minimum fallback |
| Provider outage, rate limits or cost | Medium | Insights only on state changes, merged with a cooldown; one request at a time; switch provider by configuration |

---

## Supervisor meeting: talking points

1. The problem and dataset are unchanged; O1 results stand.
2. The Power Platform licensing risk (flagged in the report) is removed.
3. The agent, which was design-only, is now built and measurable.
4. New contributions: AI embedded in the dashboard, grounding verification, small vs large model.
5. The user study design is unchanged except for the conditions.
6. Ask: approval for the new title; ethics submission timing; whether one dataset is enough or a second should be attempted.
