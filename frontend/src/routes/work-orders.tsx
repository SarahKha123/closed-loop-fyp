// /work-orders — the maintenance queue: every work order, who raised it (system or user), and the prediction behind it.

import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/ui/Button"
import { Card } from "../components/ui/Card"
import { EmptyState } from "../components/ui/EmptyState"
import { Icon } from "../components/ui/Icon"
import { useLive } from "../context/LiveContext"
import { NewWorkOrder } from "../features/dashboard/NewWorkOrder"
import { api, componentByName } from "../lib/api"
import type { WorkOrder } from "../lib/api"
import { num } from "../lib/format"

type Filter = "all" | "Open" | "Closed"

export const Route = createFileRoute("/work-orders")({
  component: WorkOrdersPage,
})

const priorityStyle = {
  High: "bg-critical-bg text-critical-text",
  Medium: "bg-warning-bg text-warning-text",
  Low: "bg-surface-3 text-ink-muted",
}

function WorkOrdersPage() {
  const { overview } = useLive()
  const [filter, setFilter] = useState<Filter>("all")
  const [orders, setOrders] = useState<WorkOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [tick, setTick] = useState(0)

  // Refresh whenever the overview changes (a new cycle or a work order event), or after an action here.
  useEffect(() => {
    api
      .workOrders(filter === "all" ? undefined : filter)
      .then((r) => {
        setOrders(r.workOrders)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load work orders"))
  }, [filter, overview, tick])

  async function closeOrder(w: WorkOrder) {
    const note = window.prompt(`Close ${w.id} (${w.component})? Optional note on what was done:`, "")
    if (note === null) return
    try {
      await api.closeWorkOrder(w.id, note)
      setTick((t) => t + 1)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "could not close the work order")
    }
  }

  const openCount = overview?.kpis.openWorkOrders ?? 0

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Work orders"
        subtitle={`${openCount} open · raised automatically when a component turns Critical (closed again when it recovers), or by hand`}
        actions={
          !creating && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Icon name="workorder" size={14} /> New work order
            </Button>
          )
        }
      />
      {creating && (
        <NewWorkOrder
          onDone={() => {
            setCreating(false)
            setTick((t) => t + 1)
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
            className={`rounded-md px-3 py-1 text-[12.5px] font-medium ${filter === f ? "bg-accent-bg text-accent-text" : "text-ink-muted hover:text-ink"}`}
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
          <table className="tabular w-full text-[12.5px]">
            <thead className="border-b border-line bg-surface-2 text-[11.5px] text-ink-muted">
              <tr>
                <th className="py-2 pl-4 text-left font-medium">ID</th>
                <th className="py-2 text-left font-medium">Component</th>
                <th className="py-2 text-left font-medium">Priority</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Raised by</th>
                <th className="py-2 text-left font-medium">Triggered at</th>
                <th className="py-2 text-left font-medium">Note</th>
                <th className="py-2 pr-4 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((w) => (
                <tr key={w.id} className="border-t border-line first:border-t-0">
                  <td className="py-2 pl-4 font-mono text-[12px] font-medium text-ink">{w.id}</td>
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
                    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${priorityStyle[w.priority]}`}>{w.priority}</span>
                  </td>
                  <td className="py-2">
                    <span className={`inline-flex items-center gap-1.5 ${w.status === "Open" ? "font-medium text-ink" : "text-ink-faint"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${w.status === "Open" ? "bg-critical" : "bg-ink-faint"}`} />
                      {w.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        w.createdBy.startsWith("system") ? "bg-accent-bg text-accent-text" : "bg-surface-3 text-ink-muted"
                      }`}
                      title={w.createdBy}
                    >
                      {w.createdBy.startsWith("system") ? "System" : "User"}
                    </span>
                  </td>
                  <td className="py-2 text-ink-muted">{w.triggeredByCycle ? `cycle ${num(w.triggeredByCycle)}` : "—"}</td>
                  <td className="max-w-[420px] py-2 text-ink-muted">
                    <div className="truncate" title={w.note ?? ""}>
                      {w.note ?? "—"}
                    </div>
                    {w.closedNote && (
                      <div className="truncate text-[11.5px] text-ink-faint" title={w.closedNote}>
                        Closed: {w.closedNote}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {w.status === "Open" && (
                      <Button size="sm" onClick={() => void closeOrder(w)}>
                        Close
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
