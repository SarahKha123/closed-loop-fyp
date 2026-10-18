// Failure probability of every component over the recent cycles — the "where is risk heading" view.
// Chart by default; a table view carries the same numbers (for exact values and accessibility).

import { useState } from "react"
import { LineChart } from "../../components/charts/LineChart"
import { Button } from "../../components/ui/Button"
import { Card, CardHeader } from "../../components/ui/Card"
import { EmptyState } from "../../components/ui/EmptyState"
import { Icon } from "../../components/ui/Icon"
import { TREND_WINDOW } from "../../context/LiveContext"
import type { Trend } from "../../lib/api"
import { COMPONENTS } from "../../lib/api"
import { pct } from "../../lib/format"

export function TrendPanel({ trend, className = "" }: { trend: Trend | null; className?: string }) {
  const [view, setView] = useState<"chart" | "table">("chart")
  const has = Boolean(trend && trend.cycles.length)
  const series = COMPONENTS.map((c) => ({ name: c.name, color: c.series, values: trend?.series[c.name].failureProbability ?? [] }))

  return (
    <Card className={`flex min-h-0 flex-col ${className}`}>
      <CardHeader
        title="Risk trend"
        subtitle={`Failure probability per component · last ${TREND_WINDOW} cycles`}
        actions={
          <div className="flex rounded-lg border border-line p-0.5">
            <Button size="sm" variant={view === "chart" ? "secondary" : "ghost"} onClick={() => setView("chart")} aria-pressed={view === "chart"} className="!h-7 !border-0">
              <Icon name="chart" size={14} /> Chart
            </Button>
            <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")} aria-pressed={view === "table"} className="!h-7 !border-0">
              <Icon name="table" size={14} /> Table
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 px-3 pb-3">
        {!has ? (
          <EmptyState icon="chart" title="No trend yet">
            The trend fills in as cycles are replayed and scored.
          </EmptyState>
        ) : view === "chart" ? (
          <LineChart x={trend!.cycles} series={series} />
        ) : (
          <div className="h-full overflow-auto rounded-lg border border-line">
            <table className="tabular w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-ink-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Cycle</th>
                  {COMPONENTS.map((c) => (
                    <th key={c.key} className="px-3 py-1.5 text-right font-medium">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...trend!.cycles.keys()].reverse().map((i) => (
                  <tr key={trend!.cycles[i]} className="border-t border-line">
                    <td className="px-3 py-1 text-ink-muted">{trend!.cycles[i].toLocaleString("en-US")}</td>
                    {COMPONENTS.map((c) => (
                      <td key={c.key} className="px-3 py-1 text-right text-ink">
                        {pct(trend!.series[c.name].failureProbability[i])}
                        <span className="ml-1.5 text-ink-faint">{trend!.series[c.name].condition[i]?.[0] ?? ""}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}
