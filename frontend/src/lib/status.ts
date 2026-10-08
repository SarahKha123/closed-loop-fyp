// How each condition looks: reserved status colours, always with an icon and a label.

import type { Condition } from "./api"

export const conditionStyle: Record<Condition, { text: string; bg: string; dot: string; border: string; icon: "check" | "alert" | "octagon" }> = {
  Optimal: { text: "text-good-text", bg: "bg-good-bg", dot: "bg-good", border: "border-good/30", icon: "check" },
  Degraded: { text: "text-warning-text", bg: "bg-warning-bg", dot: "bg-warning", border: "border-warning/40", icon: "alert" },
  Critical: { text: "text-critical-text", bg: "bg-critical-bg", dot: "bg-critical", border: "border-critical/40", icon: "octagon" },
}

/** Meter fill by severity (accent → warning → critical), per the data-viz method. */
export function severityFill(p: number): string {
  return p >= 0.7 ? "var(--critical)" : p >= 0.3 ? "var(--warning)" : "var(--accent)"
}

export const conditionRank: Record<Condition, number> = { Optimal: 0, Degraded: 1, Critical: 2 }
