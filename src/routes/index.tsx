import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { StatusPill } from "../components/StatusPill"
import { components, kpiTiles } from "../data"
import { statusClasses } from "../lib/status"

export const Route = createFileRoute("/")({
  component: LoopView,
})

function LoopView() {
  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title="System Overview"
        subtitle="Latest batch · Cycle 1,465 of 2,205 · UCI Hydraulic Condition Monitoring dataset"
      />

      <div className="flex gap-4">
        {kpiTiles.map((k) => (
          <div key={k.label} className="flex-1 rounded-xl border border-ink/10 bg-surface p-4">
            <div className="text-[11px] tracking-wide text-ink-faint uppercase">{k.label}</div>
            <div
              className={`mt-1.5 text-[22px] font-bold ${k.kind ? statusClasses[k.kind].text : "text-ink"}`}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {components.map((c) => (
          <div
            key={c.name}
            className="flex flex-col gap-2.5 rounded-[14px] border border-ink/10 bg-surface p-[18px]"
          >
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold">{c.name}</div>
              <StatusPill kind={c.kind} label={c.statusLabel} />
            </div>
            <div className="text-[12.5px] text-ink-faint">{c.unit}</div>
            <div className="text-xl font-bold">{c.value}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-track">
              <div
                className={`h-full rounded-full ${statusClasses[c.kind].dot}`}
                style={{ width: `${c.gaugePct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
