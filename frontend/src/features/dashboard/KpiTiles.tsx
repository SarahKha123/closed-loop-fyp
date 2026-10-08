// The overview's headline numbers: condition counts (latest state of each component), average risk, open work orders.

import type { Overview } from "../../lib/api"
import { pct } from "../../lib/format"
import { Icon, type IconName } from "../../components/ui/Icon"

function Tile({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: IconName; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon name={icon} size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] text-ink-muted">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] leading-tight font-semibold text-ink">{value}</span>
          <span className="truncate text-[11.5px] text-ink-faint">{sub}</span>
        </div>
      </div>
    </div>
  )
}

export function KpiTiles({ overview }: { overview: Overview | null }) {
  const k = overview?.kpis
  const has = Boolean(overview?.cycle)
  const v = (n: number | undefined) => (has && n != null ? String(n) : "—")
  return (
    <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 @5xl:grid-cols-5">
      <Tile label="Critical" value={v(k?.critical)} sub={`of ${k?.monitored ?? 4} components`} icon="octagon" tone="bg-critical-bg text-critical-text" />
      <Tile label="Degraded" value={v(k?.degraded)} sub="need attention soon" icon="alert" tone="bg-warning-bg text-warning-text" />
      <Tile label="Optimal" value={v(k?.optimal)} sub="healthy" icon="check" tone="bg-good-bg text-good-text" />
      <Tile
        label="Avg failure probability"
        value={has ? pct(k?.avgFailureProbability ?? null, 0) : "—"}
        sub="across components"
        icon="activity"
        tone="bg-accent-bg text-accent-text"
      />
      <Tile label="Open work orders" value={v(k?.openWorkOrders)} sub="maintenance queue" icon="workorder" tone="bg-surface-3 text-ink-muted" />
    </div>
  )
}
