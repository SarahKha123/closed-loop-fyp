// The overview's lead: the rig's hydraulic circuit as a closed loop, each component placed where it sits in it and
// lit by its live condition, with the counts under it. Fluid moves through the pipes only while the replay plays.
// Narrower than 672px the pipes drop away and the four components sit in a 2×2 grid.

import { Link } from "@tanstack/react-router"
import { Icon } from "../../components/ui/Icon"
import { Meter } from "../../components/ui/Meter"
import { useLive } from "../../context/LiveContext"
import type { ComponentName, ComponentState, Overview } from "../../lib/api"
import { COMPONENTS } from "../../lib/api"
import { pct } from "../../lib/format"
import { conditionStyle } from "../../lib/status"

// Where each component sits on the drawing, in % of the frame. The pipes below are drawn on the same 0–100 grid.
const AT: Record<ComponentName, { x: number; y: number }> = {
  Pump: { x: 25, y: 22 },
  Valve: { x: 62, y: 22 },
  Accumulator: { x: 43.5, y: 60 },
  Cooler: { x: 62, y: 86 },
}
const LOOP = "M6 54 V22 H94 V86 H6 Z" // tank → pump → valve → load → cooler → tank
const BRANCH = "M43.5 22 V60" // the accumulator tees off the pressure line

function Node({ name, state }: { name: ComponentName; state?: ComponentState }) {
  const meta = COMPONENTS.find((c) => c.name === name)!
  const s = state && conditionStyle[state.condition]
  const alarm = state && state.condition !== "Optimal"
  return (
    <Link
      to="/components/$component"
      params={{ component: meta.key }}
      style={{ left: `${AT[name].x}%`, top: `${AT[name].y}%` }}
      className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition-colors hover:border-accent @2xl:absolute @2xl:w-[clamp(150px,22%,196px)] @2xl:-translate-x-1/2 @2xl:-translate-y-1/2 ${
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
      <span className="flex items-baseline justify-between gap-2">
        {/* key: remount on change so the new value flashes once. */}
        <span key={state?.failureProbability} className={`tabular text-2xl font-medium text-ink ${state ? "animate-value" : ""}`}>
          {state ? pct(state.failureProbability) : "—"}
        </span>
        <span className="text-xs text-ink-faint">failure prob.</span>
      </span>
      <Meter value={state?.failureProbability ?? 0} label={`${name} failure probability`} />
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

export function RigSchematic({ overview }: { overview: Overview | null }) {
  const { replay } = useLive()
  const byName = new Map(overview?.components.map((c) => [c.component, c]))
  const flowing = replay?.state === "playing"
  const k = overview?.cycle ? overview.kpis : null
  const v = (n: number | undefined) => (k && n != null ? String(n) : "—")

  return (
    <section aria-label="Rig" className="rounded-xl border border-line bg-surface">
      <div className="relative grid grid-cols-2 gap-3 p-4 @2xl:block @2xl:h-[268px] @2xl:p-0">
        <svg className="absolute inset-0 hidden h-full w-full @2xl:block" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
        <span className="absolute top-[54%] left-[6%] hidden -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface-2 px-2 py-1 text-sm text-ink-muted @2xl:block">
          Tank
        </span>
        <span className="absolute top-[54%] left-[94%] hidden -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface-2 px-2 py-1 text-sm text-ink-muted @2xl:block">
          Load
        </span>
        {COMPONENTS.map((c) => (
          <Node key={c.key} name={c.name} state={byName.get(c.name)} />
        ))}
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
