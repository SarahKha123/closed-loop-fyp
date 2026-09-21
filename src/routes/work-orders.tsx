import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { StatusPill } from "../components/StatusPill"
import { workOrders } from "../data"

export const Route = createFileRoute("/work-orders")({
  component: WorkOrdersView,
})

function WorkOrdersView() {
  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader title="Work Orders" subtitle="Automated and manual maintenance actions" />

      <div className="flex flex-col gap-3">
        {workOrders.map((w) => (
          <div
            key={w.id}
            className="flex items-center gap-4 rounded-xl border border-ink/10 bg-surface p-4"
          >
            <StatusPill kind={w.kind} label={w.status} />
            <div className="grow">
              <div className="text-[14px] font-semibold">
                {w.id} · {w.component}
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-faint">{w.note}</div>
            </div>
            <div className="text-right text-[12px] text-ink-faint">
              <div>{w.when}</div>
              <div>{w.assignee}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
