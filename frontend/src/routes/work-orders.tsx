// /work-orders — the maintenance queue: every work order, who raised it (system or user), and the prediction behind it.
// Two tabs: the queue (WorkOrderQueue) and, at ?tab=history, the outcomes technicians recorded (OutcomeHistory).

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/ui/Button"
import { Icon } from "../components/ui/Icon"
import { useLive } from "../context/LiveContext"
import { NewWorkOrder } from "../features/dashboard/NewWorkOrder"
import { OutcomeHistory } from "../features/work-orders/OutcomeHistory"
import { WorkOrderQueue } from "../features/work-orders/WorkOrderQueue"

export const Route = createFileRoute("/work-orders")({
  validateSearch: (search: Record<string, unknown>): { tab?: "history" } => ({
    tab: search.tab === "history" ? "history" : undefined,
  }),
  component: WorkOrdersPage,
})

function WorkOrdersPage() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { overview } = useLive()
  const [creating, setCreating] = useState(false)
  const [tick, setTick] = useState(0)

  const openCount = overview?.kpis.openWorkOrders ?? 0
  const refresh = () => setTick((t) => t + 1)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Work orders"
        subtitle={`${openCount} open · raised automatically when a component turns Critical, or by hand · closed by a technician with what they found`}
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
            refresh()
          }}
        />
      )}

      <div data-tour="tabs" role="tablist" aria-label="Work orders" className="flex items-center gap-1 border-b border-line">
        {(["queue", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={(tab ?? "queue") === t}
            onClick={() => void navigate({ search: { tab: t === "history" ? "history" : undefined } })}
            className={`-mb-px border-b px-3 py-2.5 text-base font-medium transition-colors ${
              (tab ?? "queue") === t ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t === "queue" ? "Queue" : "History"}
          </button>
        ))}
      </div>

      {tab === "history" ? (
        <OutcomeHistory refreshKey={`${tick}-${openCount}`} />
      ) : (
        <WorkOrderQueue refreshKey={tick} onChanged={refresh} />
      )}
    </div>
  )
}
