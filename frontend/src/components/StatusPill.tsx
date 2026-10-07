// Coloured pill with a status dot, e.g. "• Critical".

import { statusClasses } from "../lib/status"
import type { StatusKind } from "../domain/types"

export function StatusPill({ kind, label }: { kind: StatusKind; label: string }) {
  const c = statusClasses[kind]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[16.5px] font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`inline-block h-[7px] w-[7px] rounded-full ${c.dot}`} />
      {label}
    </span>
  )
}
