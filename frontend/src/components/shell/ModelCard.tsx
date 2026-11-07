// Sidebar summary of the model the Advisor uses; opens the AI model page.

import { Link } from "@tanstack/react-router"
import { useModels } from "../../context/ModelsContext"

export function ModelCard() {
  const { loading, error, active } = useModels()
  const label = loading ? "Loading…" : error ? "Backend unreachable" : (active?.tag ?? "Not set up")

  return (
    <Link
      to="/models"
      className="group block rounded-lg bg-surface px-3 py-2 transition-colors hover:bg-surface-2"
      activeProps={{ className: "!bg-surface-2" }}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-ink-faint">
        Advisor model
        <span className="truncate">{active?.label ?? ""}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2 text-base font-medium text-ink">
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${loading ? "bg-ink-faint" : active?.resolved ? "bg-good" : "bg-critical"}`}
        />
        <span className={`truncate text-base ${active?.tag ? "font-mono" : ""}`}>{label}</span>
      </div>
    </Link>
  )
}
