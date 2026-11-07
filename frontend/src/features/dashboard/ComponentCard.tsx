// One component under the rig drawing: the change since the last cycle, how long it has been in its condition, what
// is driving it and its work order. Its probability is on the drawing and its trend on the chart, so neither repeats here.

import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { ConditionBadge } from "../../components/ui/ConditionBadge"
import type { ComponentState } from "../../lib/api"
import { componentByName } from "../../lib/api"
import { num, pct, reading } from "../../lib/format"
import { conditionStyle } from "../../lib/status"

function Row({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-2" title={title}>
      <span className="truncate text-ink-faint">{label}</span>
      <span className="tabular shrink-0 text-ink">{children}</span>
    </div>
  )
}

export function ComponentCard({ state }: { state: ComponentState }) {
  const meta = componentByName(state.component)
  const delta = state.previousFailureProbability == null ? null : state.failureProbability - state.previousFailureProbability
  const driver = state.shap[0]
  return (
    <Link
      to="/components/$component"
      params={{ component: state.key }}
      className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-surface px-4 py-3 transition-colors hover:border-accent ${
        state.condition === "Optimal" ? "border-line" : conditionStyle[state.condition].border
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: meta?.series }} />
          <span className="truncate text-lg font-semibold text-ink">{state.component}</span>
        </span>
        <ConditionBadge condition={state.condition} size="sm" />
      </div>

      <div className="flex flex-col gap-0.5 text-sm">
        {/* Signed change since the previous cycle; colour says better or worse, the sign says which way. */}
        <Row label="Since last cycle">
          {delta != null && Math.abs(delta) >= 0.005 ? (
            <span className={`font-medium ${delta > 0 ? "text-critical-text" : "text-good-text"}`}>
              {delta > 0 ? "+" : "−"}
              {pct(Math.abs(delta))}
            </span>
          ) : (
            <span className="text-ink-faint">±0.0%</span>
          )}
        </Row>
        <Row label={`${state.condition} since`}>cycle {num(state.since)}</Row>
        {driver && (
          <Row label={driver.label} title="The sensor feature that pushed the model most toward this condition (SHAP)">
            {reading(driver.value, driver.unit)}
          </Row>
        )}
        <Row label="Work order">
          <span className={state.openWorkOrder ? "font-medium text-critical-text" : "text-ink-faint"}>{state.openWorkOrder ?? "None open"}</span>
        </Row>
      </div>
    </Link>
  )
}
