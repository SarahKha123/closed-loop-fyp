// / — the overview. Its question: is the rig healthy right now? The subtitle states the one finding (the worst
// component, or that all four are Optimal); the rig drawing answers it; trend, cards and activity give the evidence.

import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/ui/Button"
import { Card } from "../components/ui/Card"
import { EmptyState } from "../components/ui/EmptyState"
import { Icon } from "../components/ui/Icon"
import { useLive } from "../context/LiveContext"
import { ActivityFeed } from "../features/dashboard/ActivityFeed"
import { ComponentCard } from "../features/dashboard/ComponentCard"
import { RigSchematic } from "../features/dashboard/RigSchematic"
import { TrendPanel } from "../features/dashboard/TrendPanel"
import { StatusBanner } from "../features/dashboard/StatusBanner"
import { COMPONENTS } from "../lib/api"
import type { Overview } from "../lib/api"
import { conditionRank } from "../lib/status"
import { num, pct } from "../lib/format"

export const Route = createFileRoute("/")({
  component: OverviewPage,
})

const SPARK_POINTS = 60

/** The one thing the overview should say first: the worst component and what is being done about it. */
function finding(o: Overview): string {
  const worst = [...o.components].sort(
    (a, b) => conditionRank[b.condition] - conditionRank[a.condition] || b.failureProbability - a.failureProbability,
  )[0]
  if (!worst || worst.condition === "Optimal") return `All ${o.components.length} components Optimal at cycle ${num(o.cycle)}`
  const others = o.components.filter((c) => c !== worst && c.condition !== "Optimal").length
  return [
    `${worst.component} ${worst.condition}${worst.since ? ` since cycle ${num(worst.since)}` : ""}, ${pct(worst.failureProbability)} failure probability`,
    worst.openWorkOrder ? `work order ${worst.openWorkOrder} open` : "no work order open",
    others ? `${others} more not Optimal` : null,
  ]
    .filter(Boolean)
    .join(", ")
}

function OverviewPage() {
  const { overview, trend, events, replay, control, loading } = useLive()
  const hasData = Boolean(overview?.cycle)

  return (
    <div className="flex h-full min-h-[680px] flex-col gap-5">
      <PageHeader
        title="Rig overview"
        subtitle={hasData ? <span className="text-lg text-ink">{finding(overview!)}</span> : "The UCI hydraulic test rig, replayed cycle by cycle and scored as each one arrives"}
      />
      <StatusBanner overview={overview} />
      <RigSchematic overview={overview} />

      {!hasData ? (
        <Card className="flex flex-1 items-center justify-center">
          {loading ? (
            <EmptyState icon="activity" title="Loading…" />
          ) : (
            <EmptyState
              icon="play"
              title="The replay hasn't started"
              action={
                <Button variant="primary" onClick={() => void control.play()} disabled={!replay}>
                  <Icon name="play" size={14} /> Start the live replay
                </Button>
              }
            >
              Recorded cycles arrive one at a time, as if from the rig. Each is scored by the four trained models and
              shown here as it happens. Starts at cycle {num(replay?.nextCycle ?? 1665)}, the first all-healthy cycle.
            </EmptyState>
          )}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 @5xl:grid-cols-4">
            {COMPONENTS.map((c) => {
              const state = overview!.components.find((s) => s.component === c.name)
              const history = trend?.series[c.name].failureProbability.slice(-SPARK_POINTS) ?? []
              return state ? <ComponentCard key={c.key} state={state} history={history} /> : null
            })}
          </div>
          <div className="grid min-h-[320px] flex-1 grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TrendPanel trend={trend} />
            <ActivityFeed events={events} />
          </div>
        </>
      )}
    </div>
  )
}
