// Page title + one-line description, with optional actions on the right.

import type { ReactNode } from "react"

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div data-tour="page-actions" className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
