// /sensors — all 17 channels for the current cycle: mean, variability, min, max, and which components they relate to.
// ?component=valve highlights that component's sensors.

import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { Card } from "../components/ui/Card"
import { EmptyState } from "../components/ui/EmptyState"
import { useLive } from "../context/LiveContext"
import { COMPONENTS, api, componentByKey, componentByName } from "../lib/api"
import type { Sensors } from "../lib/api"
import { num, reading } from "../lib/format"

export const Route = createFileRoute("/sensors")({
  validateSearch: (search: Record<string, unknown>): { component?: string } => ({
    component: typeof search.component === "string" && componentByKey(search.component) ? search.component : undefined,
  }),
  component: SensorsPage,
})

const chip = "rounded-full border px-2.5 py-1 text-sm font-medium transition-colors"

function SensorsPage() {
  const { component } = Route.useSearch()
  const focus = component ? componentByKey(component)! : null
  const { overview } = useLive()
  const [data, setData] = useState<Sensors | null>(null)

  useEffect(() => {
    if (!overview?.cycle) return
    api.sensors(overview.cycle).then(setData).catch(() => setData(null))
  }, [overview?.cycle])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sensors"
        subtitle={
          data
            ? `Cycle ${num(data.cycle)} · 17 channels · ${data.stable ? "rig may not have settled yet (stable flag 1)" : "stable conditions"}`
            : "17 channels: pressure, motor power, flow, temperature, vibration, and three derived efficiency values"
        }
      />

      <div data-tour="sensor-filter" className="flex flex-wrap items-center gap-1.5">
        <Link to="/sensors" search={{}} className={`${chip} ${!focus ? "border-line-strong bg-surface-3 text-ink" : "border-line text-ink-muted hover:bg-surface-3"}`}>
          All
        </Link>
        {COMPONENTS.map((c) => (
          <Link
            key={c.key}
            to="/sensors"
            search={{ component: c.key }}
            className={`${chip} inline-flex items-center gap-1.5 ${
              focus?.key === c.key ? "border-line-strong bg-surface-3 text-ink" : "border-line text-ink-muted hover:bg-surface-3"
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.series }} />
            {c.name}
          </Link>
        ))}
      </div>

      <Card tour="sensor-table">
        {!data ? (
          <EmptyState icon="sensor" title="No readings yet">
            Start the replay from the top bar to see each cycle's sensor values.
          </EmptyState>
        ) : (
          <table className="tabular w-full text-base">
            <thead className="border-b border-line bg-surface-2 text-sm text-ink-muted">
              <tr>
                <th className="py-2 pl-4 text-left font-medium">Sensor</th>
                <th className="py-2 text-left font-medium">Measures</th>
                <th className="py-2 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Mean</th>
                <th className="py-2 text-right font-medium">Std dev</th>
                <th className="py-2 text-right font-medium">Min</th>
                <th className="py-2 text-right font-medium">Max</th>
                <th className="py-2 pr-4 pl-6 text-left font-medium">Related to</th>
              </tr>
            </thead>
            <tbody>
              {data.sensors.map((s) => {
                const dim = focus && !s.relatedComponents.includes(focus.name)
                return (
                  <tr key={s.sensor} className={`border-t border-line first:border-t-0 ${dim ? "opacity-40" : ""} ${focus && !dim ? "bg-accent-bg/40" : ""}`}>
                    <td className="py-2 pl-4 font-mono text-sm font-medium text-ink">{s.sensor}</td>
                    <td className="py-2 text-ink">
                      {s.name} <span className="text-ink-faint">· {s.unit}</span>
                    </td>
                    <td className="py-2 text-right text-ink-faint">{s.rateHz} Hz</td>
                    <td className="py-2 text-right font-medium text-ink">{reading(s.mean)}</td>
                    <td className="py-2 text-right text-ink-muted">{reading(s.std)}</td>
                    <td className="py-2 text-right text-ink-muted">{reading(s.min)}</td>
                    <td className="py-2 text-right text-ink-muted">{reading(s.max)}</td>
                    <td className="py-2 pr-4 pl-6">
                      <span className="inline-flex flex-wrap gap-1.5">
                        {s.relatedComponents.map((n) => (
                          <span key={n} className="inline-flex items-center gap-1 text-sm text-ink-muted">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: componentByName(n)?.series }} />
                            {n}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-sm text-ink-faint">
        Each value summarises the sensor over one 60-second load cycle. "Related to" comes from the dataset analysis
        (rank correlations and the models' SHAP rankings), see docs/DATASET.md §7.
      </p>
    </div>
  )
}
