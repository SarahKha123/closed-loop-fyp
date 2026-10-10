// Types and calls for the live dashboard endpoints (docs/API.md: Replay,
// Live stream, Dashboard, Work orders). Field names match the JSON exactly.

import { request } from "./http"

export type Condition = "Optimal" | "Degraded" | "Critical"
export type ComponentName = "Cooler" | "Valve" | "Pump" | "Accumulator"
export type ComponentKey = "cooler" | "valve" | "pump" | "accumulator"

export interface ReplayState {
  state: "playing" | "paused" | "finished"
  cycle: number | null
  nextCycle: number | null
  first: number
  total: number
  secondsPerCycle: number
}

export interface Driver {
  feature: string
  label: string
  unit: string
  value: number
  contribution: number
}

export interface ComponentState {
  key: ComponentKey
  component: ComponentName
  equipmentId: string
  predictionId: number
  cycle: number
  condition: Condition
  classProbabilities: Record<Condition, number>
  failureProbability: number
  previousFailureProbability: number | null
  confidence: "High" | "Medium" | "Low"
  shap: Driver[]
  modelVersion: string
  changedFrom: Condition | null
  since: number | null
  openWorkOrder: string | null
}

export interface Overview {
  replay: ReplayState | null
  replayError: string | null
  predictor: { trainedAt: string; models: Record<ComponentKey, string>; versionWarnings: string[] } | null
  predictorError: string | null
  cycle: number | null
  kpis: {
    critical: number
    degraded: number
    optimal: number
    monitored: number
    openWorkOrders: number
    avgFailureProbability: number | null
  }
  components: ComponentState[]
}

export interface Trend {
  cycles: number[]
  series: Record<ComponentName, { failureProbability: (number | null)[]; condition: (Condition | null)[] }>
}

export interface ConditionEvent {
  cycle: number
  component: ComponentName
  fromCondition: Condition
  toCondition: Condition
  failureProbability: number
}

export interface SensorRow {
  sensor: string
  name: string
  quantity: string
  unit: string
  rateHz: number
  mean: number
  std: number
  min: number
  max: number
  relatedComponents: ComponentName[]
}

export interface Sensors {
  cycle: number
  stable: number
  sensors: SensorRow[]
}

export interface WorkOrder {
  id: string
  equipmentId: string
  component: ComponentName
  triggeredByPredictionId: number | null
  triggeredByCycle: number | null
  priority: "High" | "Medium" | "Low"
  status: "Open" | "Closed"
  createdBy: string
  assignedTo: string | null
  note: string | null
  createdAt: string
  closedAt: string | null
  closedNote: string | null
}

/** The grounding check's verdict on an AI text (docs/API.md: Insights). */
export interface Validation {
  grounded: boolean
  checked: { claim: string; ok: boolean }[]
  mismatches: string[]
}

export interface Insight {
  id: number
  createdAt: string
  cycle: number | null
  triggerType: "condition_change" | "threshold" | "work_order" | "multiple" | "manual"
  triggerRef: string | null
  model: string
  mode: "local" | "cloud"
  promptVersion: string
  text: string
  /** null: written with the grounding check off. */
  grounded: boolean | null
  validation: Validation | null
  attempts: number
  latencyMs: number | null
  firstTokenMs: number | null
}

export interface Settings {
  insights: { enabled: boolean; threshold: number; cooldownSeconds: number }
  grounding: { enabled: boolean; hideUnverified: boolean }
  monitor: { confirmCycles: number; autoCloseOnRecovery: boolean }
  chat: { maxTurns: number; tools: boolean }
}

/** A work order the Advisor proposed in chat; nothing exists until the engineer confirms it. */
export interface ProposedAction {
  id: string
  tool: "create_work_order"
  component: ComponentName
  note: string
  /** An already-open work order for the same component, if any. */
  alreadyOpen: string | null
}

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export const COMPONENTS: { key: ComponentKey; name: ComponentName; series: string }[] = [
  { key: "cooler", name: "Cooler", series: "var(--series-1)" },
  { key: "valve", name: "Valve", series: "var(--series-2)" },
  { key: "pump", name: "Pump", series: "var(--series-3)" },
  { key: "accumulator", name: "Accumulator", series: "var(--series-4)" },
]

export const componentByKey = (key: string) => COMPONENTS.find((c) => c.key === key)
export const componentByName = (name: string) => COMPONENTS.find((c) => c.name === name)

export const api = {
  overview: () => request<Overview>("/api/dashboard/overview"),
  trend: (last = 200) => request<Trend>(`/api/dashboard/trend?last=${last}`),
  events: (limit = 30) => request<{ events: ConditionEvent[] }>(`/api/dashboard/events?limit=${limit}`),
  sensors: (cycle?: number) => request<Sensors>(`/api/dashboard/sensors${cycle ? `?cycle=${cycle}` : ""}`),
  workOrders: (status?: "Open" | "Closed") =>
    request<{ workOrders: WorkOrder[] }>(`/api/work-orders${status ? `?status=${status}` : ""}`),
  createWorkOrder: (component: ComponentKey, note: string) =>
    request<WorkOrder>("/api/work-orders", { method: "POST", body: JSON.stringify({ component, note }) }),
  closeWorkOrder: (id: string, note: string) =>
    request<WorkOrder>(`/api/work-orders/${id}/close`, { method: "POST", body: JSON.stringify({ note }) }),
  insights: (limit = 30) => request<{ insights: Insight[] }>(`/api/insights?limit=${limit}`),
  // Waits for the model: allow a slow local one its time.
  generateInsight: () => request<Insight>("/api/insights/generate", { method: "POST", timeoutMs: 180000 }),
  confirmAction: (id: string, approve: boolean) =>
    request<{ status: "created"; workOrder: WorkOrder } | { status: "cancelled" }>("/api/chat/confirm", {
      method: "POST",
      body: JSON.stringify({ id, approve }),
    }),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (patch: DeepPartial<Settings>) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  replay: {
    play: () => request<ReplayState>("/api/replay/play", { method: "POST" }),
    pause: () => request<ReplayState>("/api/replay/pause", { method: "POST" }),
    step: () => request<ReplayState>("/api/replay/step", { method: "POST" }),
    reset: (cycle?: number) =>
      request<ReplayState>("/api/replay/reset", { method: "POST", body: JSON.stringify(cycle ? { cycle } : {}) }),
    speed: (secondsPerCycle: number) =>
      request<ReplayState>("/api/replay/speed", { method: "POST", body: JSON.stringify({ secondsPerCycle }) }),
    seek: (cycle: number) => request<ReplayState>("/api/replay/seek", { method: "POST", body: JSON.stringify({ cycle }) }),
  },
}
