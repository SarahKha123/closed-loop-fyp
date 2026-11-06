# Closed Loop

A predictive maintenance system for one hydraulic test rig: recorded sensor data is replayed as if live, scored by trained models, explained by a language model, and turned into maintenance work.

## The rig

**Rig**:
The hydraulic test rig whose recorded data the system monitors (UCI Condition Monitoring dataset).
_Avoid_: Machine, system, plant

**Component**:
One of the four monitored parts of the rig: Cooler, Valve, Pump, Accumulator.
_Avoid_: Asset, equipment, part

**Cycle**:
One 60-second working cycle of the rig, and the unit of time everywhere in the system.
_Avoid_: Step, tick, sample, row

**Replay**:
Feeding the recorded cycles into the system one at a time, as if they were arriving from the rig.
_Avoid_: Simulation, playback, stream

## Prediction

**Condition**:
A component's predicted state: Optimal, Degraded or Critical.
_Avoid_: Status, health, state

**Failure probability**:
The model's probability that a component is not Optimal, from 0 to 100%.
_Avoid_: Risk, risk score, failure risk

**Driver**:
The sensor feature that pushed the model most towards its prediction for a component (by SHAP value).
_Avoid_: Cause, reason, top feature

## AI

**Advisor**:
The panel where the language model speaks: it writes insights and answers questions.
_Avoid_: Chatbot, assistant, copilot, AI panel

**Insight**:
A short explanation the Advisor writes on its own when the data changes: a component changes condition, its failure probability crosses the threshold, or a work order is raised.
_Avoid_: Alert, notification, summary

**Grounding check**:
The comparison of every value an Advisor message states against the data it was given; the message is then Verified or Unverified.
_Avoid_: Validation, fact check, hallucination check

**Active model**:
The local or cloud language model the Advisor currently uses.
_Avoid_: LLM, engine, provider

## Maintenance

**Work order**:
A request for maintenance on one component, raised automatically on a Critical prediction or by a person; it is Open or Closed.
_Avoid_: Ticket, job, task, request

**Outcome**:
What a person recorded when closing a work order: the action taken and whether the prediction matched what they found.
_Avoid_: Resolution, result, feedback
