// The overview's lead: the rig's hydraulic circuit as a closed loop, each component placed where it sits in it and
// lit by its live condition, with the counts under it. Fluid moves through the pipes only while the replay plays.
// It takes whatever height its grid row gives it (never under 224px): the pipes run on the edges of an inset frame and
// each box is centred on its pipe, so nothing hangs outside the drawing at any size.
// Narrower than 672px the pipes drop away and the four components sit in a 2×2 grid.

import { Link } from "@tanstack/react-router"
import { Icon } from "../../components/ui/Icon"
import { Meter } from "../../components/ui/Meter"
import { useLive } from "../../context/LiveContext"
import type { ComponentName, ComponentState, Overview } from "../../lib/api"
import { COMPONENTS } from "../../lib/api"
import { pct } from "../../lib/format"
import { conditionStyle } from "../../lib/status"

// Where each component sits, in % of the inset frame; the pipes are drawn on the same 0–100 grid.
// The frame is inset by more than half a box's height, so boxes centred on the top and bottom pipes stay inside.
const AT: Record<ComponentName, { x: number; y: number }> = {
  Pump: { x: 22, y: 0 },
  Valve: { x: 70, y: 0 },
  Accumulator: { x: 40, y: 55 },
  Cooler: { x: 76, y: 100 },
}
const LOOP = "M0 50 V0 H100 V100 H0 Z" // tank → pump → valve → load → cooler → tank
const BRANCH = "M40 0 V55" // the accumulator tees off the pressure line

function Node({ name, state }: { name: ComponentName; state?: ComponentState }) {
  const meta = COMPONENTS.find((c) => c.name === name)!
  const s = state && conditionStyle[state.condition]
  const alarm = state && state.condition !== "Optimal"
  return (
    <Link
      to="/components/$component"
      params={{ component: meta.key }}
      style={{ left: `${AT[name].x}%`, top: `${AT[name].y}%` }}
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 transition-colors hover:border-accent @2xl:absolute @2xl:w-[clamp(156px,24%,210px)] @2xl:-translate-x-1/2 @2xl:-translate-y-1/2 ${
        state?.condition === "Critical" ? `${s!.border} bg-critical-bg` : alarm ? `${s!.border} bg-surface` : "border-line-strong bg-surface"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: meta.series }} />
        <span className="grow text-base font-semibold text-ink">{name}</span>
        {s && (
          <span className={`inline-flex items-center gap-1 text-sm font-medium ${state.condition === "Optimal" ? "text-ink-muted" : s.text}`}>
            <Icon name={s.icon} size={13} />
            {state.condition}
          </span>
        )}
      </span>
      <span className="flex items-center gap-3" title="Failure probability">
        {/* key: remount on change so the new value flashes once. */}
        <span key={state?.failureProbability} className={`tabular text-xl font-medium text-ink ${state ? "animate-value" : ""}`}>
          {state ? pct(state.failureProbability) : "—"}
        </span>
        <span className="min-w-0 grow">
          <Meter value={state?.failureProbability ?? 0} label={`${name} failure probability`} />
        </span>
      </span>
    </Link>
  )
}

function Count({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`tabular text-lg font-medium ${tone}`}>{value}</span>
      <span className="text-sm text-ink-muted">{label}</span>
    </span>
  )
}

export function RigSchematic({ overview, className = "" }: { overview: Overview | null; className?: string }) {
  const { replay } = useLive()
  const byName = new Map(overview?.components.map((c) => [c.component, c]))
  const flowing = replay?.state === "playing"
  const k = overview?.cycle ? overview.kpis : null
  const v = (n: number | undefined) => (k && n != null ? String(n) : "—")

  return (
    <section aria-label="Rig" data-tour="rig" className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface ${className}`}>
      <div className="grid grid-cols-2 gap-3 p-4 @2xl:relative @2xl:block @2xl:min-h-[224px] @2xl:flex-1 @2xl:p-0">
        {/* The inset frame everything is placed in: 48px top and bottom, 7% at the sides. */}
        <div className="contents @2xl:absolute @2xl:inset-x-[7%] @2xl:inset-y-12 @2xl:block">
        <svg className="absolute inset-0 hidden h-full w-full overflow-visible @2xl:block" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[LOOP, BRANCH].map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke="var(--surface-3)" strokeWidth="9" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                fill="none"
                stroke={flowing ? "var(--accent)" : "var(--baseline)"}
                strokeWidth="1.5"
                strokeDasharray="6 6"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className={flowing ? "animate-flow" : ""}
              />
            </g>
          ))}
        </svg>
        {/* The two parts of the circuit that aren't monitored, named so the drawing reads as a circuit. */}
        <span className="absolute top-1/2 left-0 hidden -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface-2 px-2 py-1 text-sm text-ink-muted @2xl:block">
          Tank
        </span>
        <span className="absolute top-1/2 left-full hidden -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface-2 px-2 py-1 text-sm text-ink-muted @2xl:block">
          Load
        </span>
        {COMPONENTS.map((c) => (
          <Node key={c.key} name={c.name} state={byName.get(c.name)} />
        ))}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line px-4 py-3">
        <Count label="Critical" value={v(k?.critical)} tone={k?.critical ? "text-critical-text" : "text-ink"} />
        <Count label="Degraded" value={v(k?.degraded)} tone={k?.degraded ? "text-warning-text" : "text-ink"} />
        <Count label="Optimal" value={v(k?.optimal)} />
        <span className="grow" />
        <Count label="average failure probability" value={k ? pct(k.avgFailureProbability, 0) : "—"} />
        <Link to="/work-orders" className="rounded-md no-underline hover:underline hover:decoration-accent hover:underline-offset-[6px]">
          <Count label={k?.openWorkOrders === 1 ? "open work order" : "open work orders"} value={v(k?.openWorkOrders)} tone={k?.openWorkOrders ? "text-critical-text" : "text-ink"} />
        </Link>
      </div>
    </section>
  )
}
