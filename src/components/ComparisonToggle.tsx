import { useAppState } from "../context/AppState"

export function ComparisonToggle() {
  const { showComparison, toggleComparison } = useAppState()

  return (
    <button
      type="button"
      onClick={toggleComparison}
      aria-pressed={showComparison}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-[12.5px] font-medium ${
        showComparison ? "border-accent-border bg-accent-bg text-accent-text" : "border-ink/15 text-ink-muted"
      }`}
    >
      <span>Old way vs. new way</span>
      <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${showComparison ? "bg-accent" : "bg-ink/15"}`}>
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            showComparison ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  )
}
