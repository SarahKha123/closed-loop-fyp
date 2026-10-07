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

export interface ChatMessage {
  role: "assistant" | "user"
  text: string
  /** True while an assistant reply is still streaming in from the model. */
  streaming?: boolean
  /** True when `text` is an error message rather than a real reply. */
  error?: boolean
}

/** Which sensor-code prefixes (from SensorRow.sensor) are relevant to each component. */
export const componentSensorCodes: Record<string, string[]> = {
  Cooler: ["TS1", "CP", "SE"],
  Valve: ["FS1", "PS2"],
  Pump: ["PS2", "VS1"],
  Accumulator: ["PS2", "VS1"],
}
