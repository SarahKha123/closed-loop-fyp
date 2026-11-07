// What a panel shows when there's nothing to show yet, and how to get something.

import type { ReactNode } from "react"
import { Icon, type IconName } from "./Icon"

export function EmptyState({
  icon,
  title,
  children,
  action,
  pulse,
}: {
  icon: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
  pulse?: boolean
}) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <div className={`text-ink-faint ${pulse ? "animate-live" : ""}`}>
        <Icon name={icon} size={22} />
      </div>
      <div className="text-lg font-semibold text-ink">{title}</div>
      {children && <div className="max-w-md text-base text-ink-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
