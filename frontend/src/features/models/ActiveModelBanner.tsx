import { useEffect } from "react"
import { useModels } from "../../context/ModelsContext"
import { card } from "../../lib/ui"
import type { ResolvedModel } from "./types"

/** Two rows: what answers this user's chat (their own key), and the live insights (the replay driver's key). */
export function ActiveModelBanner() {
  const { active, loading, error, refresh } = useModels()
  // The driver changes whenever someone presses a replay control, so look again on every visit.
  useEffect(() => void refresh(), [refresh])
  const driver = active?.insights.driver

  return (
    <div data-tour="model-banner" className={`${card} divide-y divide-line`}>
      {error ? (
        <p className="p-4 text-base text-critical-text">Couldn't reach the backend: {error}</p>
      ) : (
        <>
          <Row title="Your Advisor chat" detail="Your own key" model={active} loading={loading} large />
          <Row title="Live insights" detail={driver ? `${driver}'s key, while they drive the replay` : "The key of whoever presses Play"} model={active?.insights ?? null} loading={loading} />
        </>
      )}
    </div>
  )
}

function Row({ title, detail, model, loading, large }: {
  title: string
  detail: string
  model: ResolvedModel | null
  loading: boolean
  large?: boolean
}) {
  const dot = loading ? "bg-ink-faint" : model?.resolved ? "bg-good" : "bg-critical"
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 grow">
        <div className="text-sm text-ink-muted">
          {title} <span className="text-ink-faint">· {detail}</span>
        </div>
        {model?.tag ? (
          <div className={`truncate font-mono font-semibold text-ink ${large ? "text-lg" : "text-base"}`}>{model.tag}</div>
        ) : (
          <div className={`font-semibold text-ink ${large ? "text-lg" : "text-base"}`}>{loading ? "…" : "Not set up"}</div>
        )}
      </div>
      <div className="min-w-0 text-left @3xl:text-right">
        {model?.label && <div className="text-base font-medium text-ink">{model.label}</div>}
        {model && !model.resolved && <div className="text-sm text-ink-muted">{model.reason}</div>}
      </div>
    </div>
  )
}
