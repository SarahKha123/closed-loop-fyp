// The Work orders page's History tab: every closed work order as a chain — the prediction, the work order it
// raised, what the technician found — plus how often technicians confirmed the model's Critical predictions.
// Read from the outcome log, which survives replay resets.

import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { Card, CardHeader } from "../../components/ui/Card"
import { ConditionBadge } from "../../components/ui/ConditionBadge"
import { EmptyState } from "../../components/ui/EmptyState"
import { Icon } from "../../components/ui/Icon"
import { api, componentByName } from "../../lib/api"
import type { OutcomeMatch, OutcomeStats, OutcomeTally, WorkOrderOutcome } from "../../lib/api"
import { num, pct } from "../../lib/format"
import { ACTION_LABELS, MATCH_LABELS } from "./labels"

const matchStyle: Record<OutcomeMatch, { bg: string; text: string; bar: string; icon: "check" | "alert" | "octagon" }> = {
  yes: { bg: "bg-good-bg", text: "text-good-text", bar: "bg-good", icon: "check" },
  partially: { bg: "bg-warning-bg", text: "text-warning-text", bar: "bg-warning", icon: "alert" },
  no: { bg: "bg-critical-bg", text: "text-critical-text", bar: "bg-critical", icon: "octagon" },
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

function MatchBadge({ matched }: { matched: OutcomeMatch | null }) {
  if (!matched) {
    return <span className="rounded-full bg-surface-3 px-2 py-0.5 text-sm font-semibold text-ink-muted">Not verified</span>
  }
  const s = matchStyle[matched]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${s.bg} ${s.text}`}>
      <Icon name={s.icon} size={11} />
      Prediction {matched === "yes" ? "confirmed" : matched === "partially" ? "partly confirmed" : "not confirmed"}
    </span>
  )
}

/** yes / partially / no as one stacked bar, with a legend that carries the numbers. */
function TallyBar({ t }: { t: OutcomeTally }) {
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-track" role="img" aria-label={`${t.yes} confirmed, ${t.partially} partly, ${t.no} not confirmed`}>
        {(["yes", "partially", "no"] as const).map((m) => t[m] > 0 && <div key={m} className={matchStyle[m].bar} style={{ width: `${(t[m] / t.total) * 100}%` }} />)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-ink-muted">
        {(["yes", "partially", "no"] as const).map((m) => (
          <span key={m} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-sm ${matchStyle[m].bar}`} />
            {MATCH_LABELS[m]} <span className="tabular font-medium text-ink">{t[m]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function StatsCard({ stats }: { stats: OutcomeStats }) {
  const c = stats.critical
  return (
    <Card>
      <CardHeader
        title="Technician confirmation"
        subtitle="Critical predictions, as verified by the technician who closed the work order"
        actions={
          <a href="/api/work-orders/outcomes.csv" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text">
            <Icon name="table" size={13} /> Export CSV
          </a>
        }
      />
      <div className="grid gap-4 px-4 pb-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          {c.total === 0 ? (
            <p className="text-base text-ink-muted">No Critical predictions verified yet — close a work order raised from one to start the count.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-4xl leading-none font-semibold text-ink">{pct(c.confirmedRate, 0)}</span>
                <span className="text-base text-ink-muted">
                  confirmed <span className="text-ink-faint">({c.yes} of {c.total})</span>
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-faint">{pct(c.confirmedOrPartialRate, 0)} counting partial matches</p>
              <div className="mt-3">
                <TallyBar t={c} />
              </div>
            </>
          )}
        </div>
        {stats.criticalByComponent.length > 0 && (
          <table className="tabular w-full self-start text-sm">
            <thead className="text-xs text-ink-faint">
              <tr>
                <th className="pb-1 text-left font-medium">Component</th>
                <th className="pb-1 text-right font-medium">Verified</th>
                <th className="pb-1 text-right font-medium">Confirmed</th>
                <th className="pb-1 text-right font-medium">Partly</th>
                <th className="pb-1 text-right font-medium">Not</th>
                <th className="pb-1 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {stats.criticalByComponent.map((r) => (
                <tr key={r.component} className="border-t border-line">
                  <td className="py-1.5 text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: componentByName(r.component)?.series }} />
                      {r.component}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-ink-muted">{r.total}</td>
                  <td className="py-1.5 text-right text-ink-muted">{r.yes}</td>
                  <td className="py-1.5 text-right text-ink-muted">{r.partially}</td>
                  <td className="py-1.5 text-right text-ink-muted">{r.no}</td>
                  <td className="py-1.5 text-right font-medium text-ink">{pct(r.confirmedRate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
        Counts every closed work order whose prediction was Critical, across replay resets. Study-mode sessions and work orders
        closed automatically are kept out.
      </p>
    </Card>
  )
}

function Step({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-xs font-semibold tracking-wide text-ink-faint uppercase">{label}</div>
      <div className="mt-1 text-base text-ink-muted">{children}</div>
    </div>
  )
}

function Arrow() {
  return <Icon name="arrowRight" size={14} className="mt-6 hidden text-ink-faint @3xl:block" />
}

function Chain({ o }: { o: WorkOrderOutcome }) {
  const p = o.prediction
  const meta = componentByName(o.component)
  return (
    <li className="border-t border-line px-4 py-3.5 first:border-t-0">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-ink">{o.workOrderId}</span>
        <Link to="/components/$component" params={{ component: meta?.key ?? "cooler" }} className="inline-flex items-center gap-1.5 text-base font-medium text-ink">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: meta?.series }} />
          {o.component}
        </Link>
        <MatchBadge matched={o.matchedPrediction} />
        {o.studyMode && <span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-ink-muted">Study</span>}
        <span className="grow" />
        <span className="text-sm text-ink-faint">
          closed {when(o.closedAt)} by {o.closedBy === "system:monitor" ? "the monitor" : o.closedBy}
        </span>
      </div>
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:gap-4">
        <Step label={p?.source === "latest_at_open" ? "Latest prediction" : "Prediction"}>
          {p?.condition ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <ConditionBadge condition={p.condition} size="sm" />
                <span className="tabular text-ink">{pct(p.failureProbability)}</span>
                <span>failure probability</span>
              </div>
              <div className="mt-1">cycle {num(p.cycle)}{p.topDriver ? ` · ${p.topDriver}` : ""}</div>
            </>
          ) : (
            <span className="text-ink-faint">No prediction on record</span>
          )}
        </Step>
        <Arrow />
        <Step label="Work order">
          <div className="text-ink">
            {o.workOrderCreatedBy.startsWith("system") ? "Raised automatically" : "Raised by hand"}
            {o.priority ? ` · ${o.priority} priority` : ""}
          </div>
          <div className="mt-1">opened {when(o.openedAt)}</div>
        </Step>
        <Arrow />
        <Step label="Outcome">
          <div className="text-ink">{o.finding}</div>
          <div className="mt-1">
            {o.action ? ACTION_LABELS[o.action] : "Closed automatically on recovery"}
            {o.notes ? ` · ${o.notes}` : ""}
          </div>
        </Step>
      </div>
    </li>
  )
}

export function OutcomeHistory({ refreshKey }: { refreshKey: unknown }) {
  const [outcomes, setOutcomes] = useState<WorkOrderOutcome[] | null>(null)
  const [stats, setStats] = useState<OutcomeStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.workOrderHistory(), api.outcomeStats()])
      .then(([h, s]) => {
        setOutcomes(h.outcomes)
        setStats(s)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load the history"))
  }, [refreshKey])

  if (error) {
    return (
      <Card>
        <EmptyState icon="alert" title="Couldn't load the history">
          {error}
        </EmptyState>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {stats && <StatsCard stats={stats} />}
      <Card>
        <CardHeader title="Resolved work orders" subtitle="Prediction → work order → what the technician found, newest first" />
        {outcomes && outcomes.length === 0 ? (
          <EmptyState icon="workorder" title="Nothing resolved yet">
            Close an open work order with what was found, and it appears here with the prediction that raised it.
          </EmptyState>
        ) : (
          <ul className="border-t border-line">{outcomes?.map((o) => <Chain key={o.id} o={o} />)}</ul>
        )}
      </Card>
    </div>
  )
}
