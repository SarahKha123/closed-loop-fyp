// Settings tab: the runtime toggles (config/settings.json via /api/settings). Each change saves at once.

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../../lib/api"
import type { Settings } from "../../lib/api"
import { card } from "../../lib/ui"
import { Button } from "../../components/ui/Button"

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

type EmailStatus = Awaited<ReturnType<typeof api.notifications>>

/** Email on new work orders: whether .env sets it up, the mute toggle, and a test send. */
function EmailRows({ enabled, onToggle }: { enabled: boolean; onToggle: (on: boolean) => void }) {
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [test, setTest] = useState<{ busy: boolean; result: string | null; ok: boolean }>({ busy: false, result: null, ok: false })

  useEffect(() => {
    api.notifications().then(setStatus).catch(() => setStatus(null))
  }, [])

  async function sendTest() {
    setTest({ busy: true, result: null, ok: false })
    try {
      await api.sendTestEmail()
      setTest({ busy: false, result: "Sent — check the inbox.", ok: true })
    } catch (err) {
      setTest({ busy: false, result: err instanceof Error ? err.message : "could not send", ok: false })
    }
  }

  const configured = status?.configured ?? false
  const summary = !status
    ? "Checking…"
    : configured
      ? `Sending from ${status.sender} to ${status.recipients} recipient${status.recipients === 1 ? "" : "s"}. Never in study mode.`
      : "Not set up: add SMTP_USER, SMTP_APP_PASSWORD and NOTIFY_EMAIL_TO to .env, then restart."

  return (
    <>
      <Row label="Email on new work orders" hint={summary}>
        <input type="checkbox" className={toggle} disabled={!configured} checked={configured && enabled} onChange={(e) => onToggle(e.target.checked)} />
      </Row>
      <div className="flex items-center justify-between gap-6 px-4 py-3">
        <span className="min-w-0 text-sm">
          {test.result ? (
            <span role="status" className={test.ok ? "text-good-text" : "text-critical-text"}>{test.result}</span>
          ) : (
            <span className="text-ink-faint">Checks the Gmail App Password without waiting for a work order.</span>
          )}
        </span>
        <Button size="sm" className="shrink-0 whitespace-nowrap" disabled={!configured || test.busy} onClick={() => void sendTest()}>
          {test.busy ? "Sending…" : "Send test email"}
        </Button>
      </div>
    </>
  )
}

export function SettingsTab() {
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

  const section = (title: string, rows: ReactNode) => (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className={`${card} divide-y divide-line`}>{rows}</div>
    </section>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-base text-ink-faint">
        Saved to <code className="font-mono">config/settings.json</code> and applied to the next event — no restart.
      </p>
      {error && <div className="text-base text-critical-text">{error}</div>}

      {section(
        "Live insights",
        <>
          <Row label="Write insights" hint="The Advisor comments when a component changes condition, crosses the threshold, or a work order opens or closes. Off for the dashboard-only study condition.">
            <input type="checkbox" className={toggle} checked={s.insights.enabled} onChange={(e) => void save({ insights: { enabled: e.target.checked } })} />
          </Row>
          <Row label="Risk threshold (%)" hint="A failure probability crossing this, either way, triggers an insight.">
            <NumberField key={Math.round(s.insights.threshold * 100)} value={Math.round(s.insights.threshold * 100)} min={5} max={95} step={5} onSave={(v) => void save({ insights: { threshold: v / 100 } })} />
          </Row>
          <Row label="Rest between insights (s)" hint="Changes during the rest are merged into the next insight. Raise it on a slow machine so chat answers don't wait behind insights.">
            <NumberField key={s.insights.cooldownSeconds} value={s.insights.cooldownSeconds} min={0} max={600} step={5} onSave={(v) => void save({ insights: { cooldownSeconds: v } })} />
          </Row>
        </>,
      )}

      {section(
        "Grounding check",
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
        "Work orders",
        <>
          <Row label="Cycles Critical before a work order" hint="Raise above 1 to ignore one-cycle blips.">
            <NumberField key={s.monitor.confirmCycles} value={s.monitor.confirmCycles} min={1} max={20} onSave={(v) => void save({ monitor: { confirmCycles: v } })} />
          </Row>
          <Row label="Close automatically on recovery" hint="Off (default): a technician closes every work order with what they found. On: automatic ones also close when the component is Optimal again, logged as unverified.">
            <input type="checkbox" className={toggle} checked={s.monitor.autoCloseOnRecovery} onChange={(e) => void save({ monitor: { autoCloseOnRecovery: e.target.checked } })} />
          </Row>
          <EmailRows enabled={s.notifications.email} onToggle={(on) => void save({ notifications: { email: on } })} />
        </>,
      )}

      {section(
        "Chat",
        <>
          <Row label="History sent to the model" hint="User/assistant exchanges kept per request. Small local models have short context windows.">
            <NumberField key={s.chat.maxTurns} value={s.chat.maxTurns} min={1} max={50} onSave={(v) => void save({ chat: { maxTurns: v } })} />
          </Row>
          <Row label="Let the Advisor use tools" hint="Look up status and history, and propose work orders you confirm. Off: answers stream word by word from the dashboard values only — quicker on a slow machine.">
            <input type="checkbox" className={toggle} checked={s.chat.tools} onChange={(e) => void save({ chat: { tools: e.target.checked } })} />
          </Row>
        </>,
      )}
    </div>
  )
}
