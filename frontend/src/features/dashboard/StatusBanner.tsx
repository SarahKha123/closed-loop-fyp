// Problems the operator should know about before trusting the numbers: no dataset, no models, version drift, backend down.

import { useLive } from "../../context/LiveContext"
import type { Overview } from "../../lib/api"
import { Icon } from "../../components/ui/Icon"

export function StatusBanner({ overview }: { overview: Overview | null }) {
  const { error, connection } = useLive()
  const problems: { tone: "critical" | "warning"; text: string }[] = []
  if (error) problems.push({ tone: "critical", text: `${error.charAt(0).toUpperCase()}${error.slice(1)}. Start it with ./closed-loop.sh dev --host` })
  else if (connection === "offline") problems.push({ tone: "critical", text: "Live connection lost — reconnecting automatically." })
  if (overview?.replayError) problems.push({ tone: "critical", text: `Replay unavailable: ${overview.replayError}` })
  if (overview?.predictorError) problems.push({ tone: "critical", text: `Predictions unavailable: ${overview.predictorError}` })
  for (const w of overview?.predictor?.versionWarnings ?? []) problems.push({ tone: "warning", text: w })
  if (!problems.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {problems.map((p) => (
        <div
          key={p.text}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
            p.tone === "critical" ? "border-critical/30 bg-critical-bg text-critical-text" : "border-warning/40 bg-warning-bg text-warning-text"
          }`}
        >
          <Icon name={p.tone === "critical" ? "octagon" : "alert"} size={14} className="mt-0.5" />
          {p.text}
        </div>
      ))}
    </div>
  )
}
