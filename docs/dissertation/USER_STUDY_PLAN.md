# Part C plan: simulated users + a real pilot

The user study (RQ1, Section 3.8.2) is replaced by two parts. Each is reported honestly as what it is:

- **C1, simulation study.** 24 simulated participants (LLM agents with personas) carry out the 8 study tasks on the real running system, in both conditions. This gives the **task accuracy** and **effort** data.
- **C2, real pilot.** 5–8 real people do the same protocol. This gives the **SUS** and **NASA-TLX** scores, and it checks whether the simulation behaves like people.

The two data sets are never merged, averaged together or put in one statistical test. They are reported in separate tables, and C2 is used to calibrate C1.

---

## 0. Ground rules

1. **Label it.** In the dissertation, the C1 subjects are "simulated participants" or "LLM agents", never "participants" or "users". Every table and figure caption says "simulated". The abstract and the tech paper say so too.
2. **Freeze before running.** Before the first official run, commit the personas, prompts, tasks, scoring rubric, model names and number of runs (`eval/sim/PROTOCOL.md`). Nothing changes after that. If you have to change something, report both the change and the reason. This is your pre-registration.
3. **Keep everything.** Store the screenshot, the action and the model reply for every step, plus the final answers. Every number in Chapter 4 must be traceable to a stored run, the same way Part B is.
4. **Don't simulate feelings.** C1 does **not** produce SUS or NASA-TLX scores. Workload and usability come only from real people (C2).
5. **Use a different model from the Advisor.** The simulated user must not be the same model as the Advisor it is talking to. Otherwise the result partly measures a model agreeing with itself.
6. **Don't let C1 see the answers.** The agent never sees `config/study_scenarios.json`, the reference answers or the true labels. It only sees the screen.

---

## 1. C1: simulation study

### 1.1 What it can and cannot answer

| Can answer | Cannot answer |
|---|---|
| Can the task be answered correctly from what's on screen, with and without the AI layer? | How real people *feel*: workload, usability, trust |
| How much interaction it takes (steps, page visits, chat turns) | Human reading speed, fatigue, learning effects |
| Which tasks and conditions cause errors, and whether an AI statement caused them (over-reliance) | Whether results generalise to maintenance staff |

Write RQ1 for C1 as: *"To what extent does the AI layer change task accuracy and interaction effort for simulated users, and does a small human pilot show the same pattern?"*

### 1.2 Design

- **Within-subjects**, the same as the human protocol: each simulated participant does Set A in one condition and Set B in the other.
- **Counterbalancing:** reuse `study.plan(n)`, with its 4 rotating orders. There is no learning between tasks (each task starts with a fresh context), but keeping the same plan makes C1 and C2 directly comparable.
- **N = 24.** That is 6 per order. It gives 24 × 8 = **192 task attempts** (96 per condition).
- **Repeats:** each persona runs once at temperature 0.7, with a recorded seed. Optionally, run 3 personas three times each to measure run-to-run noise.

### 1.3 Personas (24 = 4 types × 6)

Every persona gets a short profile: role, experience, and the habits listed below. Keep them plain; no backstory fiction.

| Type | n | Profile | Behavioural instruction |
|---|---|---|---|
| Novice technician | 6 | 0–1 years' experience, no analytics background | Reads quickly and trusts what is written. Doesn't open detail pages unless needed. |
| Experienced technician | 6 | 5+ years with hydraulics, little dashboard use | Thinks in terms of physical symptoms. Checks condition badges. |
| Maintenance engineer | 6 | Engineering degree, uses dashboards weekly | Opens component pages and compares values. Asks the Advisor follow-up questions. |
| Sceptical supervisor | 6 | Manager who distrusts automation | Prefers the dashboard over the AI. Cross-checks AI claims against the badges. |

The sceptic and novice types are there to test over-reliance and under-reliance (Parasuraman and Riley [46]). Vary the wording within each type: give the 6 personas of a type 6 different names and small variations in profile, and fix them all in `eval/sim/personas.json`.

### 1.4 How the agent sees the system

The agent uses the **real web UI**, not the JSON snapshot. Otherwise the dashboard-only condition would also hand it the same structured data and the comparison would mean nothing.

The loop per task, in a new script `eval/sim_users.py`:

1. The researcher side calls the study API to start the task, exactly as the researcher console does (`start_task`: reset → step → pause).
2. Playwright (already used for the Chapter 4 screenshots) opens the participant view in the right condition.
3. Each step:
   - take a screenshot and send it, the task question and the persona to a **vision model** through the existing OpenAI-compatible client;
   - the model replies with **one JSON action**: `click(x,y)`, `scroll(dy)`, `goto(route)`, `ask_advisor(text)` (AI condition only) or `answer(text)`.
4. Limits: at most **15 steps** and **6 Advisor messages** per task. If the agent reaches the limit, the attempt is logged as "gave up" and counts as incorrect.
5. Call `end_task(answer, correct=None)`. Correctness is scored afterwards (1.5), never by the agent.
6. Log per step: step number, screenshot file, action and model text. Log per task: steps, routes visited, chat turns, insights visible, final answer, wall time.

Allowed routes: `/`, `/components/<c>`, `/work-orders`, `/sensors`. Block `/admin`, `/models` and `/study/admin`.

### 1.5 Scoring

- **Correctness,** against the reference answer for each task in `study_scenarios.json`:
  - Lookup (tasks 1–2): exact. Every component or value must be right; the probability may be off by ±1 percentage point.
  - History (task 3): the WO ID, the component and the reason must all be right.
  - Diagnosis (task 4): use a 0–2 rubric. 2 = correct change, correct driver and sensible check. 1 = partly right. 0 = wrong. Count it as correct if the score is 2.
- **Two scorers:** you, plus a second person (a course mate) or a judge model that differs from the agent model and the Advisor model. The scorers see the answer but not the condition. Report Cohen's kappa ([54]/[55], interpreted with McHugh's thresholds [56]).
- **Over-reliance tag:** for every wrong answer in the AI condition, check the stored chat and insights. Was the wrong content in an AI statement? Record yes or no.

### 1.6 Measures and analysis

| Measure | Per condition | Test |
|---|---|---|
| Accuracy (overall and per task level) | Proportion correct | McNemar's test on paired task outcomes, or a Wilcoxon signed-rank test on per-agent accuracy |
| Steps to answer | Median, IQR | Wilcoxon signed-rank; effect size r |
| Pages visited, chat turns | Median | Descriptive |
| Gave up | Count | Descriptive |
| Errors caused by an AI statement | Count, % of AI-condition errors | Descriptive |

Report **steps, not seconds,** as the main effort measure. Agent wall time mostly reflects API latency, not human time. Report seconds only as a side note.

### 1.7 Validity checks (and how each one is reported)

| Threat | Check | Where it's reported |
|---|---|---|
| The agent is unlike people | Compare per-task accuracy and the ranking of task difficulty between C1 and C2 (Spearman ρ over the 8 tasks; agreement on which condition wins) | 4.5.3 |
| Persona prompts don't change behaviour | Compare behaviour across persona types (e.g. sceptics ask the Advisor less). If there's no difference, say so. | 4.5.1 |
| Run-to-run noise | Re-run 3 personas 3 times each; report how much the outcomes vary | 4.5.1 |
| Leaking the answer | The agent never sees the config or the true labels (rule 6) | 3.8.2 |
| Model self-agreement | Agent, Advisor and judge are three different models (rule 5) | 3.8.2 |
| The scorer's own bias | Blind second scorer; kappa | 4.5.1 |

### 1.8 Before you run

- [ ] **Re-check the reference answers.** If you retrain the valve model to XGBoost (recommended), the dashboard values at the task cycles change. Re-run each task preset once and update the `answer` fields. The `_about` note in the JSON says the same.
- [ ] **Dry run** 1 persona × 8 tasks × both conditions. Check that the screenshots are readable, the actions work and no blocked route is reachable.
- [ ] Freeze `PROTOCOL.md` (rule 2).
- [ ] Estimate the cost: 192 tasks × up to 15 vision calls is at most about 2,900 calls. Use a cheap vision model, run sequentially, and allow for rate limits.

---

## 2. C2: real pilot (5–8 people)

### 2.1 Ethics first (do this now)

Ask the supervisor whether an **informal usability pilot with course mates** needs full ethics approval or only a consent form. Do whatever the faculty requires. Don't recruit until it's settled. Keep the signed consent forms; Appendix B needs them.

### 2.2 Participants

- **5–8 people.** Nielsen and Landauer's model is the usual justification for about 5 users finding most usability problems. It is *not* a justification for statistical power, so the pilot's statistics are exploratory.
- **Criteria:** final-year IT or engineering students, or anyone who has used a dashboard. Record their experience level so they can be matched to the C1 persona types.
- **Sampling:** convenience sampling. Say so in Chapter 3.
- **Collection period:** state the actual dates.

### 2.3 Session (about 35 minutes, one person at a time)

1. Consent form and a 2-minute briefing (what a cycle is and what the 3 conditions mean). Give everyone the same briefing script.
2. Practice task on an untimed preset (not one of A1–B4).
3. Block 1: 4 tasks in the first condition, run from the researcher console (`study.plan(n)` sets the order).
4. **SUS + raw NASA-TLX** for that condition.
5. Block 2: 4 tasks in the other condition.
6. **SUS + raw NASA-TLX** for that condition.
7. 3 open questions: what helped, what confused you, and did you trust the AI's statements.

Use the existing researcher console for timing and logging. `GET /api/study/export` gives the CSV.

### 2.4 Analysis

- Accuracy and median time per condition.
- SUS per condition, interpreted against Bangor et al. [51]. NASA-TLX overall and per subscale.
- A Wilcoxon signed-rank test with effect size r, labelled **exploratory (n = X)**. Don't claim significance as a finding.
- A short thematic summary of the open answers.

---

## 3. Chapter changes

**Chapter 1.** Update RQ1 to the wording in 1.1. Scope: "the user evaluation combines a simulation study with a small pilot; a full user study is future work."

**Chapter 3, Section 3.8.2.** Rewrite it as two parts:
- *C1, simulation study:* the design, personas, agent loop, step limits, models used (agent, Advisor, judge), the frozen protocol and the scoring.
- *C2, pilot:* participants, sampling, criteria, period, ethics and consent, the session script and the instruments.
- One justification paragraph: time constraints; simulation as an emerging and openly reported method; the pilot as a check on it.

**Chapter 4, Section 4.5:**
- 4.5.1 C1 results: Table 4.8, accuracy and steps per condition and task level (simulated agents).
- 4.5.2 C2 results: Table 4.9, accuracy, time, SUS and NASA-TLX (pilot, n = X).
- 4.5.3 Agreement between C1 and C2, and what the agreement or disagreement means.
- 4.5.4 Discussion: compare with Figliè et al. [14] on speed on simple tasks and no consistent accuracy gain; over-reliance cases.

**Chapter 5.** RQ1 is answered *tentatively*. Under limitations: "simulated agents are not users; pilot n = X". Under future work: "a full user study with maintenance staff, using the protocol already built".

**Tech paper.** One sentence in the abstract, e.g. "In a simulation study with 24 LLM agents and a pilot with X users, …". Keep the method description short, and keep the word "simulated" in it.

---

## 4. References to add (verify each DOI before citing)

I couldn't search the web while writing this plan. These are from memory, so confirm each one on Crossref, as you did for the rest of the reference list:

- L. P. Argyle et al., "Out of one, many: Using language models to simulate human samples," *Political Analysis*, vol. 31, no. 3, 2023. *(silicon samples)*
- G. V. Aher, R. I. Arriaga, and A. T. Kalai, "Using large language models to simulate multiple humans and replicate human subject studies," *Proc. ICML*, 2023.
- P. Hämäläinen, M. Tavast, and A. Kunnari, "Evaluating large language models in generating synthetic HCI research data: A case study," *Proc. CHI*, 2023. *(it also warns about the limits)*
- J. S. Park et al., "Generative agents: Interactive simulacra of human behavior," *Proc. UIST*, 2023.
- A. Wang, J. Morgenstern, and J. P. Dickerson, "Large language models that replace human participants can harmfully misportray and flatten identity groups," *Nature Machine Intelligence*, 2025. *(cite under limitations)*
- UXAgent: LLM agents that simulate users carrying out usability tests on web interfaces (Lu et al., 2025, arXiv). Find the exact record.
- J. Nielsen and T. K. Landauer, "A mathematical model of the finding of usability problems," *Proc. INTERCHI*, 1993. *(justifies a pilot of about 5 users)*

---

## 5. Order of work

| Step | Task | Depends on |
|---|---|---|
| 1 | Ask the supervisor about ethics and consent for C2 | — |
| 2 | (Optional) retrain the valve model; re-check the reference answers | — |
| 3 | Write `eval/sim_users.py` and `eval/sim/personas.json` | 2 |
| 4 | Dry run of 1 persona; fix problems; freeze `PROTOCOL.md` | 3 |
| 5 | Official C1 run (24 agents) | 4 |
| 6 | Recruit and run C2 (5–8 people) | 1 |
| 7 | Scoring: second scorer, kappa | 5, 6 |
| 8 | `eval/analyse_study.py`: tables and the C1–C2 agreement | 7 |
| 9 | Write Sections 3.8.2 and 4.5 and the Chapter 5 updates | 8 |

Steps 3–5 and step 6 can run in parallel.
