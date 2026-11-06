// One component under the rig drawing: its recent trend, the change since the last cycle, how long it has been in
// its condition, what is driving it and its work order. The headline probability lives on the drawing above.

import { Link } from "@tanstack/react-router"
import { ConditionBadge } from "../../components/ui/ConditionBadge"
import { Sparkline } from "../../components/charts/Sparkline"
import type { ComponentState } from "../../lib/api"
import { componentByName } from "../../lib/api"
import { num, pct, reading } from "../../lib/format"
import { conditionStyle } from "../../lib/status"

export function ComponentCard({ state, history }: { state: ComponentState; history: (number | null)[] }) {
  const meta = componentByName(state.component)
  const delta = state.previousFailureProbability == null ? null : state.failureProbability - state.previousFailureProbability
  const driver = state.shap[0]
  return (
    <Link
      to="/components/$component"
      params={{ component: state.key }}
      className={`group flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-accent ${
        state.condition === "Optimal" ? "border-line" : conditionStyle[state.condition].border
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: meta?.series }} />
          <span className="text-lg font-semibold text-ink">{state.component}</span>
        </div>
        <ConditionBadge condition={state.condition} />
      </div>

      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-muted">Last {history.length} cycles</span>
        {/* Signed change since the previous cycle; colour says better or worse, the sign says which way. */}
        {delta != null && Math.abs(delta) >= 0.005 ? (
          <span className={`tabular font-medium ${delta > 0 ? "text-critical-text" : "text-good-text"}`}>
            {delta > 0 ? "+" : "−"}
            {pct(Math.abs(delta))}
          </span>
        ) : (
          <span className="tabular text-ink-faint">±0.0%</span>
        )}
      </div>

      <Sparkline values={history} color={meta?.series ?? "var(--accent)"} height={44} />

      <div className="flex flex-col gap-1 border-t border-line pt-2 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-ink-faint">{state.condition} since</span>
          <span className="tabular text-ink">
            cycle {num(state.since)}
            {state.changedFrom && <span className="text-ink-faint"> · was {state.changedFrom}</span>}
          </span>
        </div>
        {driver && (
          <div className="flex justify-between gap-2" title="The sensor feature that pushed the model most toward this condition (SHAP)">
            <span className="truncate text-ink-faint">{driver.label}</span>
            <span className="tabular shrink-0 text-ink">{reading(driver.value, driver.unit)}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-ink-faint">Work order</span>
          <span className={state.openWorkOrder ? "font-medium text-critical-text" : "text-ink-faint"}>{state.openWorkOrder ?? "None open"}</span>
        </div>
      </div>
    </Link>
  )
}
