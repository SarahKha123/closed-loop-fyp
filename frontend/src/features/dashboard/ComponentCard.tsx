// One component under the rig drawing, in two labelled halves so raw data and model output never blur:
// Measured (this cycle's sensor means, straight from the rig) and Predicted (the model's call, the recorded
// condition it is checked against, its top driver and work order). The probability is on the drawing, so not here.

import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { ConditionBadge } from "../../components/ui/ConditionBadge"
import { Icon } from "../../components/ui/Icon"
import type { ComponentState } from "../../lib/api"
import { componentByName } from "../../lib/api"
import { reading } from "../../lib/format"
import { conditionStyle } from "../../lib/status"

function Row({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-2" title={title}>
      <span className="min-w-0 leading-snug text-ink-muted">{label}</span>
      <span className="tabular shrink-0 text-ink">{children}</span>
    </div>
  )
}

function Half({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-ink-faint">{label}</span>
      {children}
    </div>
  )
}

/** `stable`: the dataset's flag for this cycle (1 = conditions may not have settled), shown only when it matters. */
export function ComponentCard({ state, stable }: { state: ComponentState; stable?: number | null }) {
  const meta = componentByName(state.component)
  const driver = state.shap[0]
  const rec = state.recorded
  const match = rec ? rec.condition === state.condition : null
  return (
    <Link
      to="/components/$component"
      params={{ component: state.key }}
      className={`flex min-w-0 flex-col gap-3 rounded-xl border bg-surface px-4 py-3 transition-colors hover:border-accent ${
        state.condition === "Optimal" ? "border-line" : conditionStyle[state.condition].border
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: meta?.series }} />
          <span className="truncate text-lg font-semibold text-ink">{state.component}</span>
        </span>
        {/* Remounts when the condition changes, so the change is seen, not just swapped. */}
        <span key={state.condition} className="animate-pop" title={state.since ? `Predicted ${state.condition} since cycle ${state.since}` : undefined}>
          <ConditionBadge condition={state.condition} size="sm" />
        </span>
      </div>

      <Half label={stable === 1 ? <>Measured · <span className="text-warning-text">rig still settling</span></> : "Measured"}>
        {state.measured.length ? (
          state.measured.map((m) => (
            <Row key={m.sensor} label={m.name} title={`${m.sensor}, mean over this cycle`}>
              {reading(m.value, m.unit)}
            </Row>
          ))
        ) : (
          <span className="text-ink-faint">No reading</span>
        )}
      </Half>

      <div className="border-t border-line" />

      <Half label="Predicted">
        {rec && (
          // One line, not a label/value row: the recorded value is too long to share the width with a label.
          <div className="flex items-center gap-1.5" title="The condition the dataset recorded for this cycle, which the prediction is checked against">
            <Icon name={match ? "check" : "close"} size={12} className={match ? "text-good-text" : "text-critical-text"} />
            <span className="sr-only">{match ? "Matches the prediction." : "Differs from the prediction."}</span>
            <span className="truncate text-ink-muted">
              Recorded <span className="text-ink">{rec.condition}</span>{" "}
              <span className="tabular text-ink-faint">{rec.unit === "leakage" ? `leak ${rec.value}` : `${rec.value}${rec.unit === "%" ? "%" : ` ${rec.unit}`}`}</span>
            </span>
          </div>
        )}
        {driver && (
          <Row label={driver.label} title={`Top driver: the feature that pushed the model most toward this condition (SHAP)`}>
            {reading(driver.value, driver.unit)}
          </Row>
        )}
        <Row label="Work order">
          <span className={state.openWorkOrder ? "font-medium text-critical-text" : "text-ink-faint"}>{state.openWorkOrder ?? "None open"}</span>
        </Row>
      </Half>
    </Link>
  )
}
