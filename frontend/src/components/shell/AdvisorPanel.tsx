// The right-hand Advisor: live insights it writes when the data changes, then a chat about the live readings,
// both answered by the active local or cloud model and grounding-checked against the snapshot it was given.

import { useEffect, useRef, useState } from "react"
import { useChat } from "../../context/ChatContext"
import type { ActionState } from "../../context/ChatContext"
import { useLive } from "../../context/LiveContext"
import { useModels } from "../../context/ModelsContext"
import { api } from "../../lib/api"
import type { Insight, Validation } from "../../lib/api"
import { num } from "../../lib/format"
import { Button } from "../ui/Button"
import { Icon } from "../ui/Icon"

// Models answer in light Markdown: render **bold**, `code`, bullets and drop heading marks; pre-wrap keeps the line breaks.
// ponytail: not a Markdown parser (no tables, links, nesting); swap in one if answers start using them.
function Rich({ text }: { text: string }) {
  const clean = text.replace(/^#{1,6}\s+/gm, "").replace(/^(\s*)[*-] /gm, "$1• ")
  return clean.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) =>
    part.length > 4 && part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded bg-surface px-1 font-mono text-sm">{part.slice(1, -1)}</code>
    ) : (
      part
    ),
  )
}

/** ✓ Verified / ⚠ Unverified, opening to every value the check compared. Nothing when the check didn't run. */
function GroundingBadge({ grounded, validation }: { grounded?: boolean | null; validation?: Validation | null }) {
  if (grounded == null) return null
  return (
    <details className="text-xs">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-1.5 py-px font-semibold ${
          grounded ? "bg-good-bg text-good-text" : "bg-warning-bg text-warning-text"
        }`}
        title="Every number, work order and condition in the text, checked against the data the model was given"
      >
        <Icon name={grounded ? "check" : "alert"} size={13} />
        {grounded ? "Verified" : "Unverified"}
      </summary>
      <ul className="mt-1 flex flex-col gap-px pl-1">
        {!validation?.checked.length ? (
          <li className="text-ink-faint">Nothing checkable in the text.</li>
        ) : (
          validation.checked.map((c, i) => (
            <li key={i} className={c.ok ? "text-ink-muted" : "font-medium text-critical-text"}>
              {c.ok ? "✓" : "✗ not in the data:"} {c.claim}
            </li>
          ))
        )}
      </ul>
    </details>
  )
}

const LOOKUP: Record<string, string> = { get_equipment_status: "status", get_history: "history" }

/** A work order the model proposed: nothing is created until the engineer presses Create. */
function ActionCard({ action: a }: { action: ActionState }) {
  const { respond } = useChat()
  return (
    <div className="mt-2 rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-sm whitespace-normal text-ink">
      <div className="font-semibold">Create a work order for the {a.component.toLowerCase()}?</div>
      {a.note && <div className="mt-0.5 text-ink-muted">{a.note}</div>}
      {a.alreadyOpen && a.state === "pending" && <div className="mt-0.5 text-warning-text">{a.alreadyOpen} is already open for it.</div>}
      <div className="mt-1.5 flex items-center gap-1.5">
        {a.state === "pending" || a.state === "busy" ? (
          <>
            <Button size="sm" variant="primary" disabled={a.state === "busy"} onClick={() => void respond(a.id, true)}>
              Create
            </Button>
            <Button size="sm" variant="ghost" disabled={a.state === "busy"} onClick={() => void respond(a.id, false)}>
              Cancel
            </Button>
          </>
        ) : a.state === "created" ? (
          <span className="font-medium text-good-text">✓ {a.workOrderId} created</span>
        ) : a.state === "cancelled" ? (
          <span className="text-ink-faint">Cancelled</span>
        ) : (
          <span className="text-critical-text">{a.error}</span>
        )}
      </div>
    </div>
  )
}

const TRIGGER: Record<Insight["triggerType"], string> = {
  condition_change: "Condition change",
  threshold: "Risk threshold",
  work_order: "Work order",
  multiple: "Several changes",
  manual: "Summary",
}

function InsightCard({ insight: i }: { insight: Insight }) {
  return (
    <article className="animate-toast-in rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-1 text-xs text-ink-faint">
        <span className="font-semibold text-ink-muted">{TRIGGER[i.triggerType]}</span>
        <span>· cycle {num(i.cycle)}</span>
        <span className="ml-auto">{new Date(i.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="mt-1 text-base leading-relaxed whitespace-pre-wrap text-ink">
        <Rich text={i.text} />
      </p>
      <div className="mt-1.5 flex flex-wrap items-start gap-x-2 gap-y-1 text-xs text-ink-faint">
        <GroundingBadge grounded={i.grounded} validation={i.validation} />
        <span className="truncate pt-px" title={i.model}>
          {i.mode} · {i.model}
          {i.latencyMs != null && ` · ${(i.latencyMs / 1000).toFixed(1)} s`}
          {i.attempts > 1 && " · rewritten once"}
        </span>
      </div>
    </article>
  )
}

function InsightsFeed() {
  const { insights, insightNotice, overview } = useLive()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function summarise() {
    setBusy(true)
    try {
      await api.generateInsight() // the new insight arrives through the live stream
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not write a summary")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex max-h-[45%] shrink-0 flex-col border-b border-line" aria-label="Live insights">
      <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
        <span className="text-sm font-semibold text-ink-muted">Live insights</span>
        <span className="grow" />
        <Button size="sm" variant="ghost" onClick={() => void summarise()} disabled={busy || !overview?.cycle} className="!h-7">
          {busy ? "Writing…" : "Summarise now"}
        </Button>
      </div>
      {(error ?? insightNotice) && (
        <div className="mx-4 mb-2 rounded-md bg-warning-bg px-2.5 py-1.5 text-sm text-warning-text">{error ?? insightNotice}</div>
      )}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-3">
        {insights.length === 0 ? (
          <p className="text-sm text-ink-faint">
            The Advisor writes a short note here when a component changes condition, crosses the risk threshold, or a work
            order opens or closes.
          </p>
        ) : (
          insights.map((i) => <InsightCard key={i.id} insight={i} />)
        )}
      </div>
    </section>
  )
}

/** No `onClose`: the panel can't be hidden (study mode, AI condition). */
export function AdvisorPanel({ onClose }: { onClose?: () => void }) {
  const { messages, streaming, send, stop, clear } = useChat()
  const { overview } = useLive()
  const { active } = useModels()
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const flagged = overview?.components.filter((c) => c.condition !== "Optimal") ?? []
  const suggestions = [
    ...flagged.slice(0, 2).map((c) => `Why is the ${c.component.toLowerCase()} ${c.condition.toLowerCase()}?`),
    overview?.cycle ? "Summarise the current state of the rig" : null,
    flagged.length ? "What should maintenance do first?" : null,
  ].filter((s): s is string => Boolean(s))

  function submit(text: string) {
    if (!text.trim() || streaming) return
    send(text)
    setInput("")
  }

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col rounded-xl border border-line bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-bg text-accent-text">
          <Icon name="chat" size={14} />
        </div>
        <div className="min-w-0 grow leading-tight">
          <div className="text-base font-semibold text-ink">Advisor</div>
          <div className="truncate text-sm text-ink-faint">
            {active?.tag ? `${active.tag} · ${active.mode === "cloud" ? "cloud" : "local"}` : "No model selected"}
          </div>
        </div>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clear} disabled={streaming}>
            Clear
          </Button>
        )}
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Hide Advisor" className="!h-8 !w-8">
            <Icon name="close" size={14} />
          </Button>
        )}
      </header>

      <InsightsFeed />

      <div ref={scrollRef} className="flex min-h-0 grow flex-col gap-2.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="my-auto text-center">
            <div className="text-base font-semibold text-ink">Ask about the live readings</div>
            <p className="mx-auto mt-1 max-w-[300px] text-base text-ink-faint">
              The Advisor sees each component's condition, failure probability and the sensor values driving it.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-xl px-3 py-2 text-base leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end bg-accent text-white"
                  : m.error
                    ? "self-start border border-critical/30 bg-critical-bg text-critical-text"
                    : "self-start bg-surface-3 text-ink"
              }`}
            >
              {m.lookups && m.lookups.length > 0 && (
                <div className="mb-1 text-xs text-ink-faint">Looked up {[...new Set(m.lookups.map((l) => LOOKUP[l] ?? l))].join(", ")}</div>
              )}
              {m.role === "assistant" && !m.error && m.text ? <Rich text={m.text} /> : m.text || (m.streaming ? <span className="animate-live text-ink-faint">Thinking…</span> : "")}
              {m.actions?.map((a) => <ActionCard key={a.id} action={a} />)}
              {m.noTools && !m.streaming && (
                <div className="mt-1 text-xs text-ink-faint">This model can't look things up or raise work orders — answered from the dashboard values.</div>
              )}
              {m.model && !m.streaming && (
                <div className="mt-1.5 flex flex-wrap items-start gap-x-2 gap-y-1 text-xs text-ink-faint">
                  <GroundingBadge grounded={m.grounded} validation={m.validation} />
                  <span className="pt-px">{m.model}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {suggestions.length > 0 && messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-accent-border bg-accent-bg px-2.5 py-1 text-left text-sm font-medium text-accent-text hover:brightness-95"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
      >
        <label htmlFor="advisor-input" className="sr-only">
          Message the Advisor
        </label>
        <textarea
          id="advisor-input"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit(input)
            }
          }}
          placeholder="Ask about a component or reading…"
          className="max-h-32 min-h-9 grow resize-none rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-base text-ink"
        />
        {streaming ? (
          <Button variant="secondary" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" size="icon" type="submit" disabled={!input.trim()} aria-label="Send">
            <Icon name="send" size={14} />
          </Button>
        )}
      </form>
    </aside>
  )
}
