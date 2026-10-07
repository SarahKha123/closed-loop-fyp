import { Link, createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { StatusPill } from "../components/StatusPill"
import { useAppState } from "../context/AppState"
import { statusClasses } from "../lib/status"

export const Route = createFileRoute("/")({
  component: LoopView,
})

function LoopView() {
  const { cycle, kpiTiles } = useAppState()

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title="System Overview"
        subtitle={`Latest batch · Cycle ${cycle.id.toLocaleString()} of 2,205 · UCI Hydraulic Condition Monitoring dataset`}
      />

      <div className="flex gap-4">
        {kpiTiles.map((k) => (
          <div key={k.label} className="flex-1 rounded-xl border border-ink/10 bg-surface p-4">
            <div className="text-[16px] tracking-wide text-ink-faint uppercase">{k.label}</div>
            <div
              className={`mt-1.5 text-[28px] font-bold ${k.kind ? statusClasses[k.kind].text : "text-ink"}`}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {cycle.components.map((c) => (
          <Link
            key={c.name}
            to="/sensors"
            search={{ component: c.name }}
            className="flex flex-col gap-2.5 rounded-[14px] border border-ink/10 bg-surface p-[18px] transition-colors hover:border-accent-border"
          >
            <div className="flex items-center justify-between">
              <div className="text-[20px] font-semibold">{c.name}</div>
              <StatusPill kind={c.kind} label={c.statusLabel} />
            </div>
            <div className="text-[17.5px] text-ink-faint">{c.unit}</div>
            <div className="text-3xl font-bold">{c.value}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-track">
              <div
                className={`h-full rounded-full ${statusClasses[c.kind].dot}`}
                style={{ width: `${c.gaugePct}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
