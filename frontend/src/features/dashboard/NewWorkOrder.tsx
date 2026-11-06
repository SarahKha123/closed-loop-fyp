// A small inline form to raise a work order by hand (CreatedBy = user).

import { useState } from "react"
import { Button } from "../../components/ui/Button"
import { COMPONENTS, api } from "../../lib/api"
import type { ComponentKey } from "../../lib/api"
import { inputCompact } from "../../lib/ui"

export function NewWorkOrder({ initial, onDone }: { initial?: ComponentKey; onDone: () => void }) {
  const [component, setComponent] = useState<ComponentKey>(initial ?? "cooler")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    try {
      await api.createWorkOrder(component, note)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not create the work order")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-line-strong bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
        Component
        <select value={component} onChange={(e) => setComponent(e.target.value as ComponentKey)} className={inputCompact}>
          {COMPONENTS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[280px] grow flex-col gap-1 text-sm font-medium text-ink-muted">
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should maintenance do?" className={inputCompact} maxLength={500} />
      </label>
      <Button type="submit" variant="primary" disabled={busy}>
        Raise work order
      </Button>
      <Button onClick={onDone} variant="ghost">
        Cancel
      </Button>
      {error && <div className="w-full text-sm text-critical-text">{error}</div>}
    </form>
  )
}
