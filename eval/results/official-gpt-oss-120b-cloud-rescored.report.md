# Insight evaluation — official-gpt-oss-120b-cloud-rescored.csv

50 scenarios, 2 models, 2 repeat(s), prompt insight-v1. Hallucination = the final text has at least one number, work order ID or condition not in the snapshot.

## Per model and validator setting

| Model | Mode | Validator | Runs | Grounding accuracy | Hallucination | First-attempt halluc. | Coverage | First token (median / p90) | Total (median / p90) | Errors |
|---|---|---|---|---|---|---|---|---|---|---|
| gpt-oss:120b-cloud | cloud | off | 68 | 99.8% ± 1.7 | 1.5% | 42.6% | 98.5% | 2.3 s / 3.8 s | 2.7 s / 4.3 s | 0 |
| gpt-oss:120b-cloud | cloud | on | 68 | 100.0% ± 0.0 | 0.0% | 42.6% | 98.5% | 2.1 s / 3.5 s | 3.6 s / 5.5 s | 0 |

## Validator effect (RQ3)

| Model | Hallucination off → on | Accuracy off → on | Regeneration rate (on) | Median total off → on |
|---|---|---|---|---|
| gpt-oss:120b-cloud | 1.5% → 0.0% | 99.8% → 100.0% | 42.6% | 2.7 s → 3.6 s |

## By scenario category (all models)

| Category | Validator | Runs | Hallucination | Coverage |
|---|---|---|---|---|
| all_clear | off | 20.0 | 0.0% | 100.0% |
| all_clear | on | 20.0 | 0.0% | 100.0% |
| steady | off | 18.0 | 0.0% | 94.4% |
| steady | on | 18.0 | 0.0% | 94.4% |
| to_critical | off | 10.0 | 10.0% | 100.0% |
| to_critical | on | 10.0 | 0.0% | 100.0% |
| to_degraded | off | 10.0 | 0.0% | 100.0% |
| to_degraded | on | 10.0 | 0.0% | 100.0% |
| to_optimal | off | 10.0 | 0.0% | 100.0% |
| to_optimal | on | 10.0 | 0.0% | 100.0% |

## Most frequent unsupported claims

| Claim | Times |
|---|---|
| `Pump: Degraded` | 1 |

![Trade-off](official-gpt-oss-120b-cloud-rescored-tradeoff.png)

![Validator effect](official-gpt-oss-120b-cloud-rescored-validator.png)
