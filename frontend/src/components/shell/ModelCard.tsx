// Sidebar summary of the model the Advisor uses; opens the AI models page (or a new tab).

import { Link } from "@tanstack/react-router"
import { useModels } from "../../context/ModelsContext"

export function ModelCard() {
  const { modelsLoading, modelsError, models, active } = useModels()

  let label = "Loading…"
  if (!modelsLoading) {
    if (active?.tag) label = active.tag
    else if (!active && modelsError) label = "Backend unreachable"
    else if (active?.mode !== "cloud" && modelsError && models.length === 0) label = "Ollama unreachable"
    else label = "No model yet"
  }
  const where = active?.mode === "cloud" ? (active.provider ?? "cloud") : "local"

  return (
    <Link
      to="/models"
      className="group block rounded-lg border border-line bg-surface-2 px-3 py-2 transition-colors hover:border-accent-border"
      activeProps={{ className: "!border-accent-border !bg-accent-bg" }}
    >
      <div className="flex items-center justify-between text-sm font-semibold text-ink-muted">
        Advisor model
        <span className="font-normal normal-case">{active ? `${active.mode} · ${where}` : ""}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2 text-base font-medium text-ink">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${modelsLoading ? "bg-ink-faint" : active?.resolved ? "bg-good" : "bg-critical"}`}
        />
        <span className="truncate font-mono text-base">{label}</span>
      </div>
    </Link>
  )
}
