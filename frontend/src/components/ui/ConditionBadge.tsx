// A component's condition: status colour + icon + label, never colour alone.

import type { Condition } from "../../lib/api"
import { conditionStyle } from "../../lib/status"
import { Icon } from "./Icon"

export function ConditionBadge({ condition, size = "md" }: { condition: Condition; size?: "sm" | "md" }) {
  const s = conditionStyle[condition]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${s.bg} ${s.text} ${
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[12px]"
      }`}
    >
      <Icon name={s.icon} size={size === "sm" ? 11 : 12} />
      {condition}
    </span>
  )
}

export function ConditionDot({ condition }: { condition: Condition }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${conditionStyle[condition].dot}`} />
}
