// The Work orders page's Queue tab: every work order, filterable by status, and the dialog that closes one
// with what was found (CloseWorkOrderDialog). Short columns stay on one line and the note wraps, so every row
// shows its full text without a tooltip. The Close button's column is pinned to the right edge: if the column
// is too narrow for the table, the table scrolls sideways under it, and Close stays visible.

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

      <Card>
        {error ? (
          <EmptyState icon="alert" title="Couldn't load work orders">
            {error}
          </EmptyState>
        ) : !orders?.length ? (
          <EmptyState icon="workorder" title={filter === "all" ? "No work orders yet" : `No ${filter.toLowerCase()} work orders`}>
            Work orders are raised automatically when a component's prediction turns Critical, with a link back to the
            prediction that triggered it.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full text-base [&_td]:pr-3 [&_td]:align-top [&_td]:whitespace-nowrap [&_th]:pr-3 [&_th]:whitespace-nowrap">
              <thead className="border-b border-line bg-surface-2 text-sm text-ink-muted">
                <tr>
                  <th className="py-2 pl-4 text-left font-medium">ID</th>
                  <th className="py-2 text-left font-medium">Component</th>
                  <th className="py-2 text-left font-medium">Priority</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Raised by</th>
                  <th className="py-2 text-left font-medium">Triggered at</th>
                  <th className="w-full py-2 text-left font-medium">Note</th>
                  <th className="sticky right-0 border-l border-line bg-surface-2 py-2 !pr-4 pl-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((w) => (
                  <tr key={w.id} className="border-t border-line first:border-t-0">
                    <td className="py-2 pl-4 font-mono text-sm font-medium whitespace-nowrap text-ink">{w.id}</td>
                    <td className="py-2">
                      <Link
                        to="/components/$component"
                        params={{ component: componentByName(w.component)?.key ?? "cooler" }}
                        className="inline-flex items-center gap-1.5 text-ink"
                      >
                        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: componentByName(w.component)?.series }} />
                        {w.component}
                      </Link>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${priorityStyle[w.priority]}`}>{w.priority}</span>
                    </td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1.5 ${w.status === "Open" ? "font-medium text-ink" : "text-ink-faint"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${w.status === "Open" ? "bg-critical" : "bg-ink-faint"}`} />
                        {w.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                          isSystem(w.createdBy) ? "bg-accent-bg text-accent-text" : "bg-surface-3 text-ink-muted"
                        }`}
                        title={w.createdBy}
                      >
                        {isSystem(w.createdBy) ? "System" : "User"}
                      </span>
                    </td>
                    <td className="py-2 text-ink-muted">{w.triggeredByCycle ? `cycle ${num(w.triggeredByCycle)}` : "—"}</td>
                    <td className="min-w-[8rem] py-2 !whitespace-normal text-ink-muted [overflow-wrap:anywhere]">
                      <div>{w.note ?? "—"}</div>
                      {w.closedNote && <div className="mt-0.5 text-sm text-ink-faint">Closed: {w.closedNote}</div>}
                    </td>
                    <td className="sticky right-0 border-l border-line bg-surface py-2 !pr-4 pl-3 text-right">
                      {w.status === "Open" && (
                        <Button size="sm" onClick={() => setClosing(w)}>
                          Close…
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
