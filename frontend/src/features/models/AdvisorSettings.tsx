// How the Advisor behaves: the runtime toggles (config/settings.json via /api/settings). Each change saves at once.
// Everyone sees them; only an admin changes them (the API refuses anyone else), so for an engineer they are read-only.

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../../lib/api"
import type { Settings } from "../../lib/api"
import { card } from "../../lib/ui"
import { useAuth } from "../../context/AuthContext"

type Patch = Parameters<typeof api.saveSettings>[0]

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-6 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-base font-medium text-ink">{label}</span>
        <span className="block text-sm text-ink-faint">{hint}</span>
      </span>
      {children}
    </label>
  )
}

const toggle = "h-4 w-4 shrink-0 accent-[var(--accent)]"
const number = "tabular h-9 w-24 shrink-0 rounded-lg border border-line-strong bg-surface px-2 text-right text-base text-ink"

/** A number that saves on blur or Enter, so typing "15" doesn't first save "1". */
function NumberField({ value, min, max, step = 1, onSave }: { value: number; min: number; max: number; step?: number; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value)) // callers key this on `value`, so a saved change resets it
  const commit = () => {
    const v = Number(text)
    if (text !== "" && v >= min && v <= max && v !== value) onSave(v)
    else setText(String(value))
  }
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={number}
    />
  )
}

/** The server-wide switch for work-order emails. Who gets them is each person's own choice (profile menu);
 *  the sender is SMTP_USER with BREVO_API_KEY or SMTP_APP_PASSWORD in .env. */
function EmailRow({ enabled, onToggle }: { enabled: boolean; onToggle: (on: boolean) => void }) {
  const { emailSetUp } = useAuth()
  return (
    <Row
      label="Email on new work orders"
      hint={
        emailSetUp
          ? "Sent to everyone who turned on \u201cEmail me when a work order opens\u201d in their profile menu. Never in study mode."
          : "Not set up: add SMTP_USER and BREVO_API_KEY (or SMTP_APP_PASSWORD) to .env, then restart."
      }
    >
      <input type="checkbox" className={toggle} disabled={!emailSetUp} checked={emailSetUp && enabled} onChange={(e) => onToggle(e.target.checked)} />
    </Row>
  )
}

export function AdvisorSettings() {
  const readOnly = useAuth().user?.role !== "admin"
  const [s, setS] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.settings().then(setS).catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load settings"))
  }, [])

  async function save(patch: Patch) {
    try {
      setS(await api.saveSettings(patch))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save")
    }
  }

  if (!s) return <div className="text-base text-ink-faint">{error ?? "Loading settings…"}</div>

  const section = (title: string, about: string, rows: ReactNode) => (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">{about}</p>
      </div>
      <div className={`${card} divide-y divide-line`}>{rows}</div>
    </section>
  )

  // Two columns from 1024px (the AI side, then the maintenance side), one below; each column stacks its sections.
  return (
    <section data-tour="advisor-settings" aria-labelledby="advisor-settings-title" className="flex flex-col gap-5">
      <div>
        <h2 id="advisor-settings-title" className="text-xl font-semibold text-ink">
          Advisor behaviour
        </h2>
        <p className="text-sm text-ink-muted">
          {readOnly
            ? "These apply to everyone. Only an admin can change them."
            : "These apply to everyone. Each change saves at once and applies to the next event. No restart."}
        </p>
      </div>
      {error && <div className="text-base text-critical-text">{error}</div>}

      {/* A disabled fieldset turns every control inside read-only in one place; they stay legible. */}
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0 disabled:[&_input]:cursor-not-allowed">
      <div className="grid items-start gap-x-6 gap-y-5 @5xl:grid-cols-2">
      <div className="flex flex-col gap-5">
      {section(
        "Live insights",
        "When the Advisor speaks up on its own.",
        <>
          <Row label="Write insights" hint="The Advisor comments when a component changes condition, crosses the threshold, or a work order opens or closes. Off for the dashboard-only study condition.">
            <input type="checkbox" className={toggle} checked={s.insights.enabled} onChange={(e) => void save({ insights: { enabled: e.target.checked } })} />
          </Row>
          <Row label="Failure probability threshold (%)" hint="A failure probability crossing this, either way, triggers an insight.">
            <NumberField key={Math.round(s.insights.threshold * 100)} value={Math.round(s.insights.threshold * 100)} min={5} max={95} step={5} onSave={(v) => void save({ insights: { threshold: v / 100 } })} />
          </Row>
          <Row label="Rest between insights (s)" hint="Changes during the rest are merged into the next insight. Raise it to spend fewer tokens or stay under a provider's rate limit.">
            <NumberField key={s.insights.cooldownSeconds} value={s.insights.cooldownSeconds} min={0} max={600} step={5} onSave={(v) => void save({ insights: { cooldownSeconds: v } })} />
          </Row>
        </>,
      )}

      {section(
        "Grounding check",
        "How the Advisor's numbers are checked against the data.",
        <>
          <Row label="Check AI answers against the data" hint="Every number, work order and condition must be in the snapshot the model was given; one rewrite if not. Turn off to measure its effect.">
            <input type="checkbox" className={toggle} checked={s.grounding.enabled} onChange={(e) => void save({ grounding: { enabled: e.target.checked } })} />
          </Row>
          <Row label="Hide unverified insights" hint="They are still saved for the evaluation, just not shown.">
            <input type="checkbox" className={toggle} checked={s.grounding.hideUnverified} onChange={(e) => void save({ grounding: { hideUnverified: e.target.checked } })} />
          </Row>
        </>,
      )}

      {section(
        "Chat",
        "How questions to the Advisor are answered.",
        <>
          <Row label="History sent to the model" hint="User/assistant exchanges kept per request. Fewer keeps each request small and cheap.">
            <NumberField key={s.chat.maxTurns} value={s.chat.maxTurns} min={1} max={50} onSave={(v) => void save({ chat: { maxTurns: v } })} />
          </Row>
          <Row label="Let the Advisor use tools" hint="Look up status and history, and propose work orders you confirm. Off: answers stream word by word from the dashboard values only, and work with models that can't call tools.">
            <input type="checkbox" className={toggle} checked={s.chat.tools} onChange={(e) => void save({ chat: { tools: e.target.checked } })} />
          </Row>
        </>,
      )}
      </div>

      <div className="flex flex-col gap-5">
      {section(
        "Work orders",
        "When maintenance is asked for, and who hears about it.",
        <>
          <Row label="Cycles Critical before a work order" hint="Raise above 1 to ignore one-cycle blips.">
            <NumberField key={s.monitor.confirmCycles} value={s.monitor.confirmCycles} min={1} max={20} onSave={(v) => void save({ monitor: { confirmCycles: v } })} />
          </Row>
          <Row label="Close automatically on recovery" hint="Off (default): a technician closes every work order with what they found. On: automatic ones also close when the component is Optimal again, logged as unverified.">
            <input type="checkbox" className={toggle} checked={s.monitor.autoCloseOnRecovery} onChange={(e) => void save({ monitor: { autoCloseOnRecovery: e.target.checked } })} />
          </Row>
          <EmailRow enabled={s.notifications.email} onToggle={(on) => void save({ notifications: { email: on } })} />
        </>,
      )}

      </div>
      </div>
      </fieldset>
    </section>
  )
}
