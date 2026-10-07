// Tailwind classes for each status kind (good / warning / serious / critical), shared by pills, dots and gauges.

import type { StatusKind } from "../domain/types"

export const statusClasses: Record<StatusKind, { text: string; bg: string; dot: string }> = {
  good: { text: "text-good-text", bg: "bg-good-bg", dot: "bg-good" },
  warning: { text: "text-warning-text", bg: "bg-warning-bg", dot: "bg-warning" },
  serious: { text: "text-serious-text", bg: "bg-serious-bg", dot: "bg-serious" },
  critical: { text: "text-critical-text", bg: "bg-critical-bg", dot: "bg-critical" },
}
