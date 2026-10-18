// What a panel shows when there's nothing to show yet, and how to get something.

import type { ReactNode } from "react"
import { Icon, type IconName } from "./Icon"

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <div className="rounded-full bg-surface-3 p-2.5 text-ink-faint">
        <Icon name={icon} size={18} />
      </div>
      <div className="text-lg font-semibold text-ink">{title}</div>
      {children && <div className="max-w-md text-base text-ink-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
