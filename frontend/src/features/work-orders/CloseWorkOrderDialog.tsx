// Closing a work order means saying what happened: what was found, what was done, and whether it matched
// the prediction. That outcome is logged with the prediction behind the work order — the step that closes the loop.

import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Button } from "../../components/ui/Button"
import { Icon } from "../../components/ui/Icon"
import { api } from "../../lib/api"
import type { OutcomeAction, OutcomeMatch, WorkOrder } from "../../lib/api"
import { num } from "../../lib/format"
import { input } from "../../lib/ui"
import { ACTION_LABELS, MATCH_LABELS } from "./labels"

function Choices<T extends string>({ name, labels, value, onChange }: { name: string; labels: Record<T, string>; value: T | null; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="mt-1 flex flex-wrap gap-1.5">
      {(Object.keys(labels) as T[]).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`rounded-lg border px-3 py-1.5 text-base font-medium transition-colors ${
            value === k ? "border-accent-border bg-accent-bg text-accent-text" : "border-line-strong text-ink-muted hover:text-ink"
          }`}
        >
          {labels[k]}
        </button>
      ))}
    </div>
  )
}

export function CloseWorkOrderDialog({ workOrder, onClose, onClosed }: { workOrder: WorkOrder; onClose: () => void; onClosed: () => void }) {
  const [finding, setFinding] = useState("")
  const [action, setAction] = useState<OutcomeAction | null>(null)
  const [matched, setMatched] = useState<OutcomeMatch | null>(null)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const ready = finding.trim() !== "" && action !== null && matched !== null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await api.closeWorkOrder(workOrder.id, { finding: finding.trim(), action, matchedPrediction: matched, notes: notes.trim() || undefined })
      onClosed()
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not close the work order")
      setBusy(false)
    }
  }

  const automatic = workOrder.createdBy.startsWith("system")

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-wo-title"
        onSubmit={(e) => void submit(e)}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[34rem] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="close-wo-title" className="text-lg font-semibold text-ink">
              Close <span className="font-mono">{workOrder.id}</span> · {workOrder.component}
            </h2>
            <p className="mt-0.5 text-base text-ink-muted">
              {automatic && workOrder.triggeredByCycle
                ? `Raised automatically from the prediction at cycle ${num(workOrder.triggeredByCycle)}.`
                : "Raised by hand."}{" "}
              Record what was actually found — it's checked against the model's prediction.
            </p>
            {workOrder.note && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-muted">{workOrder.note}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-ink-faint hover:text-ink" aria-label="Cancel">
            <Icon name="close" size={14} />
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium text-ink-muted">
          What was found <span className="text-critical-text">*</span>
          <textarea
            className={`${input} mt-1 block min-h-[5rem] w-full resize-y`}
            value={finding}
            onChange={(e) => setFinding(e.target.value)}
            placeholder="e.g. seal wear confirmed · false alarm, sensor fault"
            maxLength={1000}
            autoFocus
            required
          />
        </label>

        <div className="mt-3 text-sm font-medium text-ink-muted">
          Action taken <span className="text-critical-text">*</span>
          <Choices name="Action taken" labels={ACTION_LABELS} value={action} onChange={setAction} />
        </div>

        <div className="mt-3 text-sm font-medium text-ink-muted">
          Did this match the model's prediction? <span className="text-critical-text">*</span>
          <Choices name="Matched the prediction" labels={MATCH_LABELS} value={matched} onChange={setMatched} />
        </div>

        <label className="mt-3 block text-sm font-medium text-ink-muted">
          Notes <span className="font-normal text-ink-faint">(optional)</span>
          <input className={`${input} mt-1 w-full`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </label>

        {error && <div className="mt-3 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical-text">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!ready || busy}>
            {busy ? "Closing…" : "Close work order"}
          </Button>
        </div>
      </form>
    </div>
  )
}
