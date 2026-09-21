import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { sensorRows } from "../data"

export const Route = createFileRoute("/sensors")({
  component: SensorsView,
})

function SensorsView() {
  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader title="Sensor Feed" subtitle="Cycle 1,465 sensor summary · 17 channels" />

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
          {sensorRows.map((s) => (
            <tr key={s.sensor} className="border-t border-ink/10">
              <td className="px-3.5 py-2.5 font-mono text-[13px]">{s.sensor}</td>
              <td className="px-3.5 py-2.5 font-mono text-[13px]">{s.mean}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
