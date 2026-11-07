import { useModels } from "../../context/ModelsContext"
import { card } from "../../lib/ui"

/** What answers the Advisor right now: the model id, its provider, and the backend's reason. */
export function ActiveModelBanner() {
  const { active, loading, error } = useModels()
  const dot = loading ? "bg-ink-faint" : active?.resolved ? "bg-good" : "bg-critical"
  // A ready model needs no explanation; only say why when nothing can answer.
  const reason = error ? `Couldn't reach the backend: ${error}` : active && !active.resolved ? active.reason : null

  return (
    <div data-tour="model-banner" className={`${card} flex flex-wrap items-center gap-x-4 gap-y-1 p-4`}>
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 grow">
        <div className="text-sm text-ink-muted">Advisor is using</div>
        {active?.tag ? (
          <div className="truncate font-mono text-lg font-semibold text-ink">{active.tag}</div>
        ) : (
          <div className="text-lg font-semibold text-ink">{loading ? "…" : "No model yet"}</div>
        )}
      </div>
      <div className="min-w-0 text-left @3xl:text-right">
        {active?.label && (
          <div className="text-base font-medium text-ink">
            {active.label}
            {active.managed && <span className="font-normal text-ink-muted"> · set by server</span>}
          </div>
        )}
        {reason && <div className="text-sm text-ink-muted">{reason}</div>}
      </div>
    </div>
  )
}
