import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { StatusPill } from "../components/StatusPill"
import { useAppState } from "../context/AppState"

export const Route = createFileRoute("/work-orders")({
  component: WorkOrdersView,
})

function WorkOrdersView() {
  const { workOrders, cycle } = useAppState()

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title="Work Orders"
        subtitle={`Automated and manual maintenance actions · as of cycle ${cycle.id.toLocaleString()}`}
      />

      {workOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-surface p-8 text-center text-[18px] text-ink-faint">
          No work orders on record yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {workOrders.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-4 rounded-xl border border-ink/10 bg-surface p-4"
            >
              <StatusPill kind={w.kind} label={w.status} />
              <div className="grow">
                <div className="text-[19px] font-semibold">
                  {w.id} · {w.component}
                </div>
                <div className="mt-0.5 text-[17.5px] text-ink-faint">{w.note}</div>
              </div>
              <div className="text-right text-[17px] text-ink-faint">
                <div>{w.when}</div>
                <div>{w.assignee}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
