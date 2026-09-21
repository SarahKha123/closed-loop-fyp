export type StatusKind = "good" | "warning" | "serious" | "critical"

export interface ComponentReading {
  name: string
  unit: string
  value: string
  statusLabel: string
  kind: StatusKind
  gaugePct: number
}

export const components: ComponentReading[] = [
  { name: "Cooler", unit: "Cooling efficiency", value: "100%", statusLabel: "Optimal", kind: "good", gaugePct: 100 },
  { name: "Valve", unit: "Switching behaviour", value: "100%", statusLabel: "Optimal", kind: "good", gaugePct: 100 },
  { name: "Pump", unit: "Internal leakage", value: "No leakage", statusLabel: "Optimal", kind: "good", gaugePct: 100 },
  { name: "Accumulator", unit: "Gas pre-charge pressure", value: "90 bar", statusLabel: "Critical", kind: "critical", gaugePct: 69 },
]

export interface WorkOrder {
  id: string
  component: string
  status: string
  kind: StatusKind
  note: string
  when: string
  assignee: string
}

export const workOrders: WorkOrder[] = [
  { id: "WO-0442", component: "Accumulator", status: "Open", kind: "critical", note: "Auto-created — gas pressure below threshold", when: "Just now", assignee: "Maintenance queue" },
  { id: "WO-0398", component: "Cooler", status: "Closed", kind: "good", note: "Resolved after component service", when: "186 batches ago", assignee: "Maintenance team" },
  { id: "WO-0355", component: "Valve", status: "Closed", kind: "good", note: "Resolved — seal replaced", when: "412 batches ago", assignee: "Maintenance team" },
]

export interface SensorRow {
  sensor: string
  mean: string
}

export const sensorRows: SensorRow[] = [
  { sensor: "PS2 — Pump outlet pressure", mean: "107.93 bar" },
  { sensor: "TS1 — Cooler temperature", mean: "44.67 °C" },
  { sensor: "FS1 — Flow rate", mean: "6.66 l/min" },
  { sensor: "VS1 — Vibration", mean: "0.62 mm/s" },
  { sensor: "CP — Cooling power", mean: "2.24 kW" },
  { sensor: "SE — System efficiency", mean: "59.69 %" },
]

export interface DataLayerStat {
  label: string
  value: string
}

export const dataLayer: DataLayerStat[] = [
  { label: "Telemetry", value: "17 sensors" },
  { label: "Component models", value: "4 (RF / XGB)" },
  { label: "Automation log", value: "Power Automate" },
  { label: "Historical cycles", value: "2,205" },
]

export interface KpiTile {
  label: string
  value: string
  kind: StatusKind | null
}

export const kpiTiles: KpiTile[] = [
  { label: "Active alerts", value: "1", kind: "critical" },
  { label: "Components monitored", value: "4", kind: null },
  { label: "Model macro-F1", value: "0.982–0.999", kind: "good" },
  { label: "Automation", value: "Autonomous", kind: null },
]

export interface ChatMessage {
  role: "assistant" | "user"
  text: string
}

export const initialMessages: ChatMessage[] = [
  { role: "assistant", text: "Latest batch processed — cycle 1,465 of 2,205. 1 component flagged for review." },
  { role: "assistant", text: "Work order WO-0442 was opened automatically for the accumulator." },
]

export const accumulatorQuestion: ChatMessage = {
  role: "user",
  text: "Why is the accumulator flagged?",
}

export const accumulatorAnswer: ChatMessage = {
  role: "assistant",
  text: "Gas pre-charge pressure is reading 90 bar, below the 100 bar threshold used in training — consistent with early accumulator wear. WO-0442 has been routed to the maintenance queue.",
}
