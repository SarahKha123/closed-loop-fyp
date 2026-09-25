import { Link, createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { componentSensorCodes } from "../data"
import { useAppState } from "../context/AppState"

interface SensorsSearch {
  component?: string
}

export const Route = createFileRoute("/sensors")({
  validateSearch: (search: Record<string, unknown>): SensorsSearch => ({
    component: typeof search.component === "string" ? search.component : undefined,
  }),
  component: SensorsView,
})

function SensorsView() {
  const { component } = Route.useSearch()
  const { cycle } = useAppState()

  const codes = component ? componentSensorCodes[component] : undefined
  const isRelevant = (sensor: string) => !codes || codes.some((code) => sensor.startsWith(code))

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader title="Sensor Feed" subtitle={`Cycle ${cycle.id.toLocaleString()} sensor summary · 17 channels`} />

      {component && (
        <div className="flex w-fit items-center gap-2 rounded-full bg-accent-bg px-3.5 py-1.5 text-[12.5px] font-medium text-accent-text">
          Filtered to {component}
          <Link to="/sensors" className="font-semibold underline">
            Clear
          </Link>
        </div>
      )}

      <table className="w-full overflow-hidden rounded-xl border border-ink/10 bg-surface [border-collapse:separate] [border-spacing:0]">
        <thead>
          <tr className="bg-[#F3F2EE]">
            <th className="px-3.5 py-2.5 text-left text-[12px] font-semibold text-ink-muted">Sensor</th>
            <th className="px-3.5 py-2.5 text-left text-[12px] font-semibold text-ink-muted">
              Cycle mean
            </th>
          </tr>
        </thead>
        <tbody>
          {cycle.sensorRows.map((s) => {
            const relevant = isRelevant(s.sensor)
            return (
              <tr
                key={s.sensor}
                className={`border-t border-ink/10 ${!relevant ? "opacity-40" : ""} ${
                  relevant && component ? "bg-accent-bg/40" : ""
                }`}
              >
                <td className="px-3.5 py-2.5 font-mono text-[13px]">{s.sensor}</td>
                <td className="px-3.5 py-2.5 font-mono text-[13px]">{s.mean}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
