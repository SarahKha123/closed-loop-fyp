// Demo data standing in for the ML pipeline's output: six processed batch
// cycles from the UCI Hydraulic Condition Monitoring dataset, plus the
// work-order history before them. Swap this file for a real API later; the
// rest of the app only reads it through maintenance.ts.

import type { ComponentReading, Cycle, DataLayerStat, WorkOrder } from "./types"

/** Cycles in the full dataset (the demo only includes a few of them). */
export const TOTAL_CYCLES = 2205

export const defaultCycleId = 1465

export const dataLayer: DataLayerStat[] = [
  { label: "Telemetry", value: "17 sensors" },
  { label: "Component models", value: "4 (RF / XGB)" },
  { label: "Automation log", value: "Power Automate" },
  { label: "Historical cycles", value: TOTAL_CYCLES.toLocaleString() },
]

/** Which sensor-code prefixes (from SensorRow.sensor) are relevant to each component. */
export const componentSensorCodes: Record<string, string[]> = {
  Cooler: ["TS1", "CP", "SE"],
  Valve: ["FS1", "PS2"],
  Pump: ["PS2", "VS1"],
  Accumulator: ["PS2", "VS1"],
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

export const historicalWorkOrders: WorkOrder[] = [
  { id: "WO-0398", component: "Cooler", status: "Closed", kind: "good", note: "Resolved after component service", when: "186 batches ago", assignee: "Maintenance team" },
  { id: "WO-0355", component: "Valve", status: "Closed", kind: "good", note: "Resolved — seal replaced", when: "412 batches ago", assignee: "Maintenance team" },
]

export const resolutionNotes: Record<string, string> = {
  "WO-0399": "Resolved — switching solenoid recalibrated",
  "WO-0417": "Resolved — heat exchanger cleaned",
  "WO-0442": "Resolved — accumulator gas recharged",
}
