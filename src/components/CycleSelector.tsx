import { useAppState } from "../context/AppState"
import { statusClasses } from "../lib/status"

export function CycleSelector() {
  const { cycles, selectedCycleId, cycle, setCycle } = useAppState()
  const index = cycles.findIndex((c) => c.id === selectedCycleId)

  function step(delta: number) {
    const next = cycles[index + delta]
    if (next) setCycle(next.id)
  }

  const flagged = cycle.components.find((c) => c.name === cycle.flaggedComponent)
  const dotClass = flagged ? statusClasses[flagged.kind].dot : statusClasses.good.dot

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Batch Cycle</div>
        <span className={`inline-block h-[7px] w-[7px] rounded-full ${dotClass}`} />
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={index <= 0}
          className="rounded-md border border-ink/15 px-2 py-1.5 text-[12px] text-ink-muted disabled:opacity-30"
          aria-label="Previous cycle"
        >
          ‹
        </button>
        <select
          value={selectedCycleId}
          onChange={(e) => setCycle(Number(e.target.value))}
          className="min-w-0 grow rounded-md border border-ink/15 bg-white px-2 py-1.5 text-[12.5px]"
        >
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              Cycle {c.id.toLocaleString()} — {c.flaggedComponent ? `${c.flaggedComponent} flagged` : "All clear"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={index >= cycles.length - 1}
          className="rounded-md border border-ink/15 px-2 py-1.5 text-[12px] text-ink-muted disabled:opacity-30"
          aria-label="Next cycle"
        >
          ›
        </button>
      </div>
    </div>
  )
}
