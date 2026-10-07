// Pure functions over the demo data: which cycle is selected, which work
// orders are open as of that cycle, and the KPI tiles. No React in here.

import { cycles, historicalWorkOrders, resolutionNotes } from "./demo-data"
import type { Cycle, KpiTile, WorkOrder } from "./types"

export function getCycle(id: number): Cycle {
  return cycles.find((c) => c.id === id) ?? cycles[cycles.length - 1]
}

function formatWhen(eventCycleId: number, selectedCycleId: number): string {
  const delta = selectedCycleId - eventCycleId
  if (delta <= 0) return "Just now"
  return `${delta} ${delta === 1 ? "batch" : "batches"} ago`
}

/** Derives the running work-order list as of the selected cycle, folding in every open/close event up to that point. */
export function getWorkOrders(selectedCycleId: number): WorkOrder[] {
  const timeline = cycles.filter((c) => c.id <= selectedCycleId).sort((a, b) => a.id - b.id)
  const open = new Map<string, WorkOrder>()
  const closed: WorkOrder[] = []

  for (const eventCycle of timeline) {
    if (eventCycle.newWorkOrder) {
      const kind = eventCycle.components.find((c) => c.name === eventCycle.newWorkOrder!.component)?.kind ?? "critical"
      open.set(eventCycle.newWorkOrder.id, {
        id: eventCycle.newWorkOrder.id,
        component: eventCycle.newWorkOrder.component,
        status: "Open",
        kind,
        note: eventCycle.newWorkOrder.note,
        when: formatWhen(eventCycle.id, selectedCycleId),
        assignee: "Maintenance queue",
      })
    }
    if (eventCycle.closesWorkOrderIds) {
      for (const id of eventCycle.closesWorkOrderIds) {
        const existing = open.get(id)
        if (!existing) continue
        open.delete(id)
        closed.unshift({
          ...existing,
          status: "Closed",
          kind: "good",
          note: resolutionNotes[id] ?? existing.note,
          when: formatWhen(eventCycle.id, selectedCycleId),
          assignee: "Maintenance team",
        })
      }
    }
  }

  return [...open.values()].reverse().concat(closed, historicalWorkOrders)
}

export function getKpiTiles(selectedCycleId: number): KpiTile[] {
  const openCount = getWorkOrders(selectedCycleId).filter((w) => w.status === "Open").length
  return [
    { label: "Active alerts", value: String(openCount), kind: openCount > 0 ? "critical" : "good" },
    { label: "Components monitored", value: "4", kind: null },
    { label: "Model macro-F1", value: "0.982–0.999", kind: "good" },
    { label: "Automation", value: "Autonomous", kind: null },
  ]
}
