// One component's live health: condition, failure probability, how long, what's driving it, and its recent trend.

import { Link } from "@tanstack/react-router"
import { ConditionBadge } from "../../components/ui/ConditionBadge"
import { Icon } from "../../components/ui/Icon"
import { Meter } from "../../components/ui/Meter"
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
      className={`group flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-5 shadow-card transition-colors hover:border-accent-border ${
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

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-muted">Failure probability</span>
          {delta != null && Math.abs(delta) >= 0.005 && (
            <span className={`tabular inline-flex items-center gap-0.5 text-sm font-medium ${delta > 0 ? "text-critical-text" : "text-good-text"}`}>
              <Icon name={delta > 0 ? "arrowUp" : "arrowDown"} size={13} />
              {pct(Math.abs(delta))}
            </span>
          )}
        </div>
        <div className="tabular mt-0.5 mb-1.5 text-3xl leading-none font-semibold text-ink">{pct(state.failureProbability)}</div>
        <Meter value={state.failureProbability} label={`${state.component} failure probability`} />
      </div>

      <Sparkline values={history} color={meta?.series ?? "var(--accent)"} height={34} />

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
