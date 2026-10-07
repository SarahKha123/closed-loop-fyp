import { useModels } from "../../context/ModelsContext"
import { card } from "../../lib/ui"

/** "Advisor is using …" — the resolved model, its mode, and the backend's reason. */
export function ActiveModelBanner() {
  const { active, modelsLoading } = useModels()
  const modeText =
    active?.mode === "cloud"
      ? `Cloud · ${active.provider}`
      : active?.mode === "pinned"
        ? "Local · pinned"
        : "Local · auto (largest installed model that fits in RAM)"

  return (
    <div className={`${card} flex items-center gap-4 p-4`}>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          modelsLoading ? "bg-ink-faint" : active?.resolved ? "bg-good" : "bg-critical"
        }`}
      />
      <div className="min-w-0">
        <div className="text-[15px] tracking-wide text-ink-faint uppercase">Advisor is using</div>
        <div className="truncate font-mono text-[20px] font-semibold">{active?.tag ?? "nothing yet"}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[16.5px] font-medium text-ink-muted">{modeText}</div>
        {active && <div className="text-[15px] text-ink-faint">{active.reason}</div>}
      </div>
    </div>
  )
}
