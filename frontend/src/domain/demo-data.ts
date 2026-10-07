import type { ComponentReading, KpiTile, SensorRow, WorkOrder } from "./data"

interface CycleWorkOrderEvent {
  id: string
  component: string
  note: string
}

export interface Cycle {
  id: number
  flaggedComponent: string | null
  newWorkOrder: CycleWorkOrderEvent | null
  closesWorkOrderIds: string[] | null
  components: ComponentReading[]
  sensorRows: SensorRow[]
}

const good = (name: string, unit: string, value: string): ComponentReading => ({
  name,
  unit,
  value,
  statusLabel: "Optimal",
  kind: "good",
  gaugePct: 100,
})

export const cycles: Cycle[] = [
  {
    id: 1200,
    flaggedComponent: null,
    newWorkOrder: null,
    closesWorkOrderIds: null,
    components: [
      good("Cooler", "Cooling efficiency", "100%"),
      good("Valve", "Switching behaviour", "100%"),
      good("Pump", "Internal leakage", "No leakage"),
      good("Accumulator", "Gas pre-charge pressure", "132 bar"),
    ],
    sensorRows: [
      { sensor: "PS2 — Pump outlet pressure", mean: "112.40 bar" },
      { sensor: "TS1 — Cooler temperature", mean: "41.20 °C" },
      { sensor: "FS1 — Flow rate", mean: "6.82 l/min" },
      { sensor: "VS1 — Vibration", mean: "0.41 mm/s" },
      { sensor: "CP — Cooling power", mean: "2.31 kW" },
      { sensor: "SE — System efficiency", mean: "63.85 %" },
    ],
  },
  {
    id: 1320,
    flaggedComponent: "Valve",
    newWorkOrder: {
      id: "WO-0399",
      component: "Valve",
      note: "Auto-created — switching response drifting from baseline",
    },
    closesWorkOrderIds: null,
    components: [
      good("Cooler", "Cooling efficiency", "100%"),
      { name: "Valve", unit: "Switching behaviour", value: "88%", statusLabel: "Degraded", kind: "warning", gaugePct: 88 },
      good("Pump", "Internal leakage", "No leakage"),
      good("Accumulator", "Gas pre-charge pressure", "129 bar"),
    ],
    sensorRows: [
      { sensor: "PS2 — Pump outlet pressure", mean: "104.10 bar" },
      { sensor: "TS1 — Cooler temperature", mean: "42.05 °C" },
      { sensor: "FS1 — Flow rate", mean: "5.98 l/min" },
      { sensor: "VS1 — Vibration", mean: "0.55 mm/s" },
      { sensor: "CP — Cooling power", mean: "2.27 kW" },
      { sensor: "SE — System efficiency", mean: "61.02 %" },
    ],
  },
  {
    id: 1401,
    flaggedComponent: "Cooler",
    newWorkOrder: {
      id: "WO-0417",
      component: "Cooler",
      note: "Auto-created — cooling efficiency degraded",
    },
    closesWorkOrderIds: ["WO-0399"],
    components: [
      { name: "Cooler", unit: "Cooling efficiency", value: "80%", statusLabel: "Reduced", kind: "serious", gaugePct: 80 },
      good("Valve", "Switching behaviour", "100%"),
      good("Pump", "Internal leakage", "No leakage"),
      good("Accumulator", "Gas pre-charge pressure", "126 bar"),
    ],
    sensorRows: [
      { sensor: "PS2 — Pump outlet pressure", mean: "109.85 bar" },
      { sensor: "TS1 — Cooler temperature", mean: "51.40 °C" },
      { sensor: "FS1 — Flow rate", mean: "6.70 l/min" },
      { sensor: "VS1 — Vibration", mean: "0.48 mm/s" },
      { sensor: "CP — Cooling power", mean: "1.78 kW" },
      { sensor: "SE — System efficiency", mean: "54.11 %" },
    ],
  },
  {
    id: 1465,
    flaggedComponent: "Accumulator",
    newWorkOrder: {
      id: "WO-0442",
      component: "Accumulator",
      note: "Auto-created — gas pressure below threshold",
    },
    closesWorkOrderIds: ["WO-0417"],
    components: [
      good("Cooler", "Cooling efficiency", "100%"),
      good("Valve", "Switching behaviour", "100%"),
      good("Pump", "Internal leakage", "No leakage"),
      { name: "Accumulator", unit: "Gas pre-charge pressure", value: "90 bar", statusLabel: "Critical", kind: "critical", gaugePct: 69 },
    ],
    sensorRows: [
      { sensor: "PS2 — Pump outlet pressure", mean: "107.93 bar" },
      { sensor: "TS1 — Cooler temperature", mean: "44.67 °C" },
      { sensor: "FS1 — Flow rate", mean: "6.66 l/min" },
      { sensor: "VS1 — Vibration", mean: "0.62 mm/s" },
      { sensor: "CP — Cooling power", mean: "2.24 kW" },
      { sensor: "SE — System efficiency", mean: "59.69 %" },
    ],
  },
  {
    id: 1540,
    flaggedComponent: null,
    newWorkOrder: null,
    closesWorkOrderIds: ["WO-0442"],
    components: [
      good("Cooler", "Cooling efficiency", "100%"),
      good("Valve", "Switching behaviour", "100%"),
      good("Pump", "Internal leakage", "No leakage"),
      good("Accumulator", "Gas pre-charge pressure", "128 bar"),
    ],
    sensorRows: [
      { sensor: "PS2 — Pump outlet pressure", mean: "111.02 bar" },
      { sensor: "TS1 — Cooler temperature", mean: "43.10 °C" },
      { sensor: "FS1 — Flow rate", mean: "6.90 l/min" },
      { sensor: "VS1 — Vibration", mean: "0.39 mm/s" },
      { sensor: "CP — Cooling power", mean: "2.29 kW" },
      { sensor: "SE — System efficiency", mean: "62.44 %" },
    ],
  },
  {
    id: 1802,
    flaggedComponent: "Pump",
    newWorkOrder: {
      id: "WO-0468",
      component: "Pump",
      note: "Auto-created — internal leakage trending upward",
    },
    closesWorkOrderIds: null,
    components: [
      good("Cooler", "Cooling efficiency", "100%"),
      good("Valve", "Switching behaviour", "100%"),
      { name: "Pump", unit: "Internal leakage", value: "Elevated leakage", statusLabel: "Leaking", kind: "serious", gaugePct: 74 },
      good("Accumulator", "Gas pre-charge pressure", "124 bar"),
    ],
    sensorRows: [
      { sensor: "PS2 — Pump outlet pressure", mean: "96.35 bar" },
      { sensor: "TS1 — Cooler temperature", mean: "44.90 °C" },
      { sensor: "FS1 — Flow rate", mean: "6.40 l/min" },
      { sensor: "VS1 — Vibration", mean: "0.58 mm/s" },
      { sensor: "CP — Cooling power", mean: "2.20 kW" },
      { sensor: "SE — System efficiency", mean: "55.73 %" },
    ],
  },
]

export const defaultCycleId = 1465

export function getCycle(id: number): Cycle {
  return cycles.find((c) => c.id === id) ?? cycles[cycles.length - 1]
}

const historicalWorkOrders: WorkOrder[] = [
  { id: "WO-0398", component: "Cooler", status: "Closed", kind: "good", note: "Resolved after component service", when: "186 batches ago", assignee: "Maintenance team" },
  { id: "WO-0355", component: "Valve", status: "Closed", kind: "good", note: "Resolved — seal replaced", when: "412 batches ago", assignee: "Maintenance team" },
]

const resolutionNotes: Record<string, string> = {
  "WO-0399": "Resolved — switching solenoid recalibrated",
  "WO-0417": "Resolved — heat exchanger cleaned",
  "WO-0442": "Resolved — accumulator gas recharged",
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

const explanationTemplates: Record<string, (value: string, woId: string) => string> = {
  Accumulator: (value, woId) =>
    `Gas pre-charge pressure is reading ${value}, below the 100 bar threshold used in training — consistent with early accumulator wear. ${woId} has been routed to the maintenance queue.`,
  Valve: (value, woId) =>
    `Switching response has drifted to ${value}, below the 95% baseline used in training — consistent with solenoid wear. ${woId} has been routed to the maintenance queue.`,
  Cooler: (value, woId) =>
    `Cooling efficiency has dropped to ${value}, below the 90% baseline used in training — consistent with a partially blocked heat exchanger. ${woId} has been routed to the maintenance queue.`,
  Pump: (value, woId) =>
    `Internal leakage has been detected (${value}), consistent with worn piston seals. ${woId} has been routed to the maintenance queue.`,
}

export function explanationFor(componentName: string, value: string, woId: string): string {
  const template = explanationTemplates[componentName]
  if (template) return template(value, woId)
  return `${componentName} is reading ${value}, outside the trained baseline. ${woId} has been routed to the maintenance queue.`
}
