// /components/$component — one component in depth: current state, class probabilities,
// why the model thinks so (SHAP), the related sensors, its risk history and its changes.

import { Link, createFileRoute, notFound } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { LineChart } from "../components/charts/LineChart"
import { Button } from "../components/ui/Button"
import { Card, CardHeader } from "../components/ui/Card"
import { ConditionBadge } from "../components/ui/ConditionBadge"
import { EmptyState } from "../components/ui/EmptyState"
import { Icon } from "../components/ui/Icon"
import { Meter } from "../components/ui/Meter"
import { useChat } from "../context/ChatContext"
import { NewWorkOrder } from "../features/dashboard/NewWorkOrder"
import { TREND_WINDOW, useLive } from "../context/LiveContext"
import { api, componentByKey } from "../lib/api"
import type { Condition, Sensors } from "../lib/api"
import { num, pct, reading } from "../lib/format"
import { conditionStyle } from "../lib/status"

export const Route = createFileRoute("/components/$component")({
  loader: ({ params }) => {
    if (!componentByKey(params.component)) throw notFound()
  },
  component: ComponentPage,
  notFoundComponent: () => <EmptyState icon="component" title="No such component" />,
})

const CONDITIONS: Condition[] = ["Optimal", "Degraded", "Critical"]

function ComponentPage() {
  const { component } = Route.useParams()
  const meta = componentByKey(component)!
  const { overview, trend, events } = useLive()
  const { send } = useChat()
  const state = overview?.components.find((c) => c.key === component)
  const [sensors, setSensors] = useState<Sensors | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!overview?.cycle) return
    api.sensors(overview.cycle).then(setSensors).catch(() => setSensors(null))
  }, [overview?.cycle])

  const model = overview?.predictor?.models[meta.key]
  const related = sensors?.sensors.filter((s) => s.relatedComponents.includes(meta.name)) ?? []
  const changes = events.filter((e) => e.component === meta.name)
  const maxContribution = Math.max(...(state?.shap.map((d) => Math.abs(d.contribution)) ?? [1]), 1e-9)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={meta.name}
        subtitle={
          state
            ? `${state.equipmentId} · ${model?.replace("_", " ") ?? "model"} · ${state.condition} since cycle ${num(state.since)}`
            : `${meta.name} · waiting for the first scored cycle`
        }
        actions={
          state && (
            <>
              {!state.openWorkOrder && (
                <Button variant="secondary" onClick={() => setCreating(true)}>
                  <Icon name="workorder" size={14} /> Raise work order
                </Button>
              )}
              <Button variant="secondary" onClick={() => send(`Explain the ${meta.name.toLowerCase()}'s current condition and what's driving it.`)}>
                <Icon name="chat" size={14} /> Ask the Advisor
              </Button>
            </>
          )
        }
      />

      {creating && <NewWorkOrder initial={meta.key} onDone={() => setCreating(false)} />}

      {!state ? (
        <Card>
          <EmptyState icon="play" title="No prediction yet">
            Start the replay from the top bar; this page fills in after the first cycle is scored.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 @4xl:grid-cols-2 @6xl:grid-cols-3">
            <Card>
              <CardHeader title="Current state" subtitle={`Cycle ${num(state.cycle)} · confidence ${state.confidence}`} />
              <div className="flex flex-col gap-3 px-4 pb-4">
                <div className="flex items-center justify-between">
                  <ConditionBadge condition={state.condition} />
                  {state.changedFrom && <span className="text-sm text-ink-faint">changed from {state.changedFrom}</span>}
                </div>
                <div>
                  <div className="text-sm text-ink-muted">Failure probability</div>
                  <div className="tabular mt-0.5 mb-1.5 text-4xl leading-none font-semibold text-ink">{pct(state.failureProbability)}</div>
                  <Meter value={state.failureProbability} label="Failure probability" />
                </div>
                <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                  <div className="text-sm text-ink-muted">Class probabilities</div>
                  {CONDITIONS.map((c) => (
                    <div key={c} className="flex items-center gap-2 text-sm">
                      <span className={`w-[84px] ${conditionStyle[c].text} font-medium`}>{c}</span>
                      <div className="h-2 grow overflow-hidden rounded-full bg-surface-3">
                        <div className={`h-full rounded-full ${conditionStyle[c].dot}`} style={{ width: `${state.classProbabilities[c] * 100}%` }} />
                      </div>
                      <span className="tabular w-12 text-right text-ink">{pct(state.classProbabilities[c])}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t border-line pt-3 text-sm">
                  <span className="text-ink-faint">Open work order</span>
                  {state.openWorkOrder ? (
                    <Link to="/work-orders" className="font-medium text-critical-text">
                      {state.openWorkOrder}
                    </Link>
                  ) : (
                    <span className="text-ink-faint">None</span>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Why this prediction" subtitle={`Top SHAP drivers toward ${state.condition}`} />
              <ol className="flex flex-col gap-3 px-4 pb-4">
                {state.shap.map((d, i) => (
                  <li key={d.feature}>
                    <div className="flex items-baseline justify-between gap-2 text-base">
                      <span className="min-w-0 truncate text-ink">
                        <span className="mr-1.5 text-ink-faint">{i + 1}</span>
                        {d.label}
                      </span>
                      <span className="tabular shrink-0 font-medium text-ink">{reading(d.value, d.unit)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 grow overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(Math.abs(d.contribution) / maxContribution) * 100}%` }} />
                      </div>
                      <span className="tabular w-14 text-right font-mono text-xs text-ink-faint">{d.feature}</span>
                    </div>
                  </li>
                ))}
                <li className="text-sm text-ink-faint">
                  Bar length is each feature's SHAP contribution relative to the strongest; values are this cycle's readings.
                </li>
              </ol>
            </Card>

            <Card className="flex flex-col">
              <CardHeader
                title="Related sensors"
                subtitle="Most associated with this component"
                actions={
                  <Link to="/sensors" search={{ component: meta.key }} className="text-sm font-medium">
                    All sensors
                  </Link>
                }
              />
              <table className="tabular w-full text-base">
                <tbody>
                  {related.map((s) => (
                    <tr key={s.sensor} className="border-t border-line">
                      <td className="py-1.5 pl-4 font-mono text-sm text-ink-faint">{s.sensor}</td>
                      <td className="py-1.5 text-ink">{s.name}</td>
                      <td className="py-1.5 pr-4 text-right text-ink">{reading(s.mean, s.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-sm text-ink-faint">Cycle means.</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="flex flex-col">
              <CardHeader title="Failure probability" subtitle={`${meta.name} · last ${TREND_WINDOW} cycles`} />
              <div className="h-[260px] px-3 pb-3">
                {trend?.cycles.length ? (
                  <LineChart
                    x={trend.cycles}
                    series={[{ name: meta.name, color: meta.series, values: trend.series[meta.name].failureProbability }]}
                    tooltipExtra={(i) => <span className="ml-1.5 text-ink-faint">{trend.series[meta.name].condition[i]}</span>}
                  />
                ) : (
                  <EmptyState icon="chart" title="No history yet" />
                )}
              </div>
            </Card>
            <Card className="flex flex-col">
              <CardHeader title="Condition changes" subtitle="Recent, newest first" />
              <div className="max-h-[276px] overflow-y-auto px-4 pb-3">
                {changes.length === 0 ? (
                  <p className="py-6 text-center text-base text-ink-faint">No changes in the recent window.</p>
                ) : (
                  <ol className="flex flex-col">
                    {changes.map((e) => (
                      <li key={e.cycle} className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                        <span className="inline-flex items-center gap-1">
                          <ConditionBadge condition={e.fromCondition} size="sm" />
                          <Icon name="arrowRight" size={13} className="text-ink-faint" />
                          <ConditionBadge condition={e.toCondition} size="sm" />
                        </span>
                        <span className="tabular text-sm text-ink-faint">cycle {num(e.cycle)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
