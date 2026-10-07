// Domain types for the dashboard: what a cycle, a component reading and a
// work order look like. No data and no logic here — see demo-data.ts and
// maintenance.ts.

export type StatusKind = "good" | "warning" | "serious" | "critical"

export interface ComponentReading {
  name: string
  unit: string
  value: string
  statusLabel: string
  kind: StatusKind
  gaugePct: number
}

export interface WorkOrder {
  id: string
  component: string
  status: "Open" | "Closed"
  kind: StatusKind
  note: string
  when: string
  assignee: string
}

export interface SensorRow {
  sensor: string
  mean: string
}

export interface DataLayerStat {
  label: string
  value: string
}

export interface KpiTile {
  label: string
  value: string
  kind: StatusKind | null
}

export interface ChatMessage {
  role: "assistant" | "user"
  text: string
  /** True while an assistant reply is still streaming in from the model. */
  streaming?: boolean
  /** True when `text` is an error message rather than a real reply. */
  error?: boolean
}

export interface Toast {
  id: number
  text: string
  tone: "critical" | "good"
}

/** A work order opened by a cycle's batch run. */
export interface CycleWorkOrderEvent {
  id: string
  component: string
  note: string
}

/** One processed batch: its component health, its sensor means, and the work-order events it caused. */
export interface Cycle {
  id: number
  flaggedComponent: string | null
  newWorkOrder: CycleWorkOrderEvent | null
  closesWorkOrderIds: string[] | null
  components: ComponentReading[]
  sensorRows: SensorRow[]
}
