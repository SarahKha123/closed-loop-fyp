import { Link } from "@tanstack/react-router"
import { useSettings } from "../context/SettingsContext"

/** The sidebar's view of the active model — a way into the Models page, not a picker. */
export function ModelCard() {
  const { modelsLoading, modelsError, models, active } = useSettings()

  let label = "Loading…"
  if (!modelsLoading) {
    if (active?.tag) label = active.tag
    else if (active?.mode !== "cloud" && modelsError && models.length === 0) label = "Ollama unreachable"
    else label = "No model yet"
  }
  const where = active?.mode === "cloud" ? (active.provider ?? "cloud") : "local"

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[16px] font-semibold tracking-wide text-ink-faint uppercase">Model</div>
        <a
          href="/models"
          target="_blank"
          rel="noreferrer"
          title="Open the Models page in a new tab"
          className="text-[14px] text-ink-faint hover:text-accent"
        >
          new tab ↗
        </a>
      </div>
      <Link
        to="/models"
        className="flex w-full flex-col gap-1 rounded-lg border border-ink/15 bg-white px-3 py-2.5 transition-colors hover:border-accent-border"
        activeProps={{ className: "!border-accent-border !bg-accent-bg" }}
      >
        <span className="flex min-w-0 items-center gap-2 text-[17.5px] font-medium text-[#3F3E3A]">
          <span
            className={`h-[7px] w-[7px] shrink-0 rounded-full ${
              modelsLoading ? "bg-ink-faint" : active?.resolved ? "bg-good" : "bg-critical"
            }`}
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex justify-between text-[14px] text-ink-faint">
          <span className="uppercase tracking-wide">
            {active?.mode ?? "—"} · {where}
          </span>
          <span className="text-accent">Manage →</span>
        </span>
      </Link>
    </div>
  )
}
