// The Work orders page's Queue tab. Open work orders are cards (what needs doing, why, and a Close button you
// can't miss); closed ones are a compact list underneath that opens to the full notes. Closing goes through
// CloseWorkOrderDialog, which records what the technician found.

import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { EmptyState } from "../../components/ui/EmptyState"
import { useLive } from "../../context/LiveContext"
import { api, componentByName, isSystem } from "../../lib/api"
import type { WorkOrder } from "../../lib/api"
import { num } from "../../lib/format"
import { CloseWorkOrderDialog } from "./CloseWorkOrderDialog"

type Filter = "all" | "Open" | "Closed"

const priorityStyle = {
  High: "bg-critical-bg text-critical-text",
  Medium: "bg-warning-bg text-warning-text",
  Low: "bg-surface-3 text-ink-muted",
}

export function WorkOrderQueue({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { overview } = useLive()
  const [filter, setFilter] = useState<Filter>("all")
  const [orders, setOrders] = useState<WorkOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<WorkOrder | null>(null)

  const open = orders?.filter((w) => w.status === "Open") ?? []
  const closed = orders?.filter((w) => w.status === "Closed") ?? []

  // Refresh whenever the overview changes (a new cycle or a work order event), or after an action on the page.
  useEffect(() => {
    api
      .workOrders(filter === "all" ? undefined : filter)
      .then((r) => {
        setOrders(r.workOrders)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load work orders"))
  }, [filter, overview, refreshKey])

  return (
    <>
      {closing && (
        <CloseWorkOrderDialog
          workOrder={closing}
          onClose={() => setClosing(null)}
          onClosed={() => {
            setClosing(null)
            onChanged()
          }}
        />
      )}

      <div className="flex w-fit rounded-lg border border-line bg-surface p-0.5">
        {(["all", "Open", "Closed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-md px-3 py-1 text-base font-medium ${filter === f ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      {error ? (
        <Card>
          <EmptyState icon="alert" title="Couldn't load work orders">
            {error}
          </EmptyState>
        </Card>
      ) : !orders ? null : !orders.length ? (
        <Card>
          <EmptyState icon="workorder" title={filter === "all" ? "No work orders yet" : `No ${filter.toLowerCase()} work orders`}>
            Work orders are raised automatically when a component's prediction turns Critical, with a link back to the
            prediction that triggered it.
          </EmptyState>
        </Card>
      ) : (
        <div data-tour="wo-list" className="flex flex-col gap-6">
          {open.length > 0 && (
            <section aria-labelledby="wo-open" className="flex flex-col gap-3">
              <h2 id="wo-open" className="text-base font-semibold text-ink">
                Open <span className="tabular font-normal text-ink-faint">{open.length}</span>
              </h2>
              <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
                {open.map((w) => (
                  <OpenCard key={w.id} w={w} onClose={() => setClosing(w)} />
                ))}
              </div>
            </section>
          )}
          {closed.length > 0 && (
            <section aria-labelledby="wo-closed" className="flex flex-col gap-3">
              <h2 id="wo-closed" className="text-base font-semibold text-ink">
                Closed <span className="tabular font-normal text-ink-faint">{closed.length}</span>
              </h2>
              <Card className="divide-y divide-line overflow-hidden">
                {closed.map((w) => (
                  <ClosedRow key={w.id} w={w} />
                ))}
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  )
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" })
}

function ComponentLink({ name }: { name: WorkOrder["component"] }) {
  const meta = componentByName(name)
  return (
    <Link to="/components/$component" params={{ component: meta?.key ?? "cooler" }} className="inline-flex items-center gap-2 text-ink">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: meta?.series }} />
      {name}
    </Link>
  )
}

function OpenCard({ w, onClose }: { w: WorkOrder; onClose: () => void }) {
  return (
    <article className={`flex flex-col gap-3 rounded-xl border bg-surface px-4 py-3 ${w.priority === "High" ? "border-critical/40" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">
          <ComponentLink name={w.component} />
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityStyle[w.priority]}`}>{w.priority}</span>
        <span className="grow" />
        <span className="font-mono text-sm text-ink-faint">{w.id}</span>
      </div>
      <p className="line-clamp-3 text-base text-ink [overflow-wrap:anywhere]" title={w.note ?? undefined}>
        {w.note ?? <span className="text-ink-faint">No note</span>}
      </p>
      <div className="mt-auto flex items-center gap-3">
        <span className="min-w-0 grow truncate text-sm text-ink-muted" title={w.createdBy}>
          {isSystem(w.createdBy) ? "Raised by the monitor" : `Raised by ${w.createdBy}`}
          {w.triggeredByCycle ? ` at cycle ${num(w.triggeredByCycle)}` : ""} · {ago(w.createdAt)}
        </span>
        <Button size="sm" variant="primary" onClick={onClose}>
          Close…
        </Button>
      </div>
    </article>
  )
}

function ClosedRow({ w }: { w: WorkOrder }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-base transition-colors hover:bg-surface-2">
        <span className="w-20 shrink-0 font-mono text-sm text-ink-faint">{w.id}</span>
        <span className="w-32 shrink-0">
          <ComponentLink name={w.component} />
        </span>
        <span className="min-w-0 grow truncate text-ink-muted">{w.closedNote ?? w.note ?? "—"}</span>
        <span className="tabular shrink-0 text-sm text-ink-faint">{w.closedAt ? ago(w.closedAt) : ""}</span>
      </summary>
      <dl className="grid gap-x-4 gap-y-1 bg-surface-2 px-4 py-3 text-sm @3xl:grid-cols-[8rem_1fr]">
        <dt className="text-ink-faint">Raised</dt>
        <dd className="text-ink">
          {isSystem(w.createdBy) ? "By the monitor" : `By ${w.createdBy}`}
          {w.triggeredByCycle ? ` at cycle ${num(w.triggeredByCycle)}` : ""}, {w.priority.toLowerCase()} priority
        </dd>
        <dt className="text-ink-faint">Note</dt>
        <dd className="text-ink [overflow-wrap:anywhere]">{w.note ?? "—"}</dd>
        <dt className="text-ink-faint">Closed with</dt>
        <dd className="text-ink [overflow-wrap:anywhere]">{w.closedNote ?? "—"}</dd>
      </dl>
    </details>
  )
}
