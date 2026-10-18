// / — the overview: headline KPIs, the four components' live health, the risk trend and recent changes.

import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/ui/Button"
import { Card } from "../components/ui/Card"
import { EmptyState } from "../components/ui/EmptyState"
import { Icon } from "../components/ui/Icon"
import { useLive } from "../context/LiveContext"
import { ActivityFeed } from "../features/dashboard/ActivityFeed"
import { ComponentCard } from "../features/dashboard/ComponentCard"
import { KpiTiles } from "../features/dashboard/KpiTiles"
import { TrendPanel } from "../features/dashboard/TrendPanel"
import { StatusBanner } from "../features/dashboard/StatusBanner"
import { COMPONENTS } from "../lib/api"
import { num } from "../lib/format"

export const Route = createFileRoute("/")({
  component: OverviewPage,
})

const SPARK_POINTS = 60

function OverviewPage() {
  const { overview, trend, events, replay, control, loading } = useLive()
  const hasData = Boolean(overview?.cycle)

  return (
    <div className="flex h-full min-h-[680px] flex-col gap-5">
      <PageHeader
        title="System overview"
        subtitle={
          hasData
            ? `Hydraulic test rig · cycle ${num(overview!.cycle)} of ${num(replay?.total ?? 2205)} · UCI Condition Monitoring dataset`
            : "Hydraulic test rig · UCI Condition Monitoring dataset, replayed cycle by cycle"
        }
      />
      <StatusBanner overview={overview} />
      <KpiTiles overview={overview} />

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
