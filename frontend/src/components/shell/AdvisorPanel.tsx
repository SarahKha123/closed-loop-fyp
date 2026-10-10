// The right-hand Advisor: live insights it writes when the data changes, then a chat about the live readings,
// both answered by the active local or cloud model and grounding-checked against the snapshot it was given.

import { useEffect, useRef, useState } from "react"
import { useChat } from "../../context/ChatContext"
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
      <code key={i} className="rounded bg-surface px-1 font-mono text-[12px]">{part.slice(1, -1)}</code>
    ) : (
      part
    ),
  )
}

/** ✓ Verified / ⚠ Unverified, opening to every value the check compared. Nothing when the check didn't run. */
function GroundingBadge({ grounded, validation }: { grounded?: boolean | null; validation?: Validation | null }) {
  if (grounded == null) return null
  return (
    <details className="text-[11px]">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-1.5 py-px font-semibold ${
          grounded ? "bg-good-bg text-good-text" : "bg-warning-bg text-warning-text"
        }`}
        title="Every number, work order and condition in the text, checked against the data the model was given"
      >
        <Icon name={grounded ? "check" : "alert"} size={11} />
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
      <div className="flex items-center gap-1 text-[11px] text-ink-faint">
        <span className="font-semibold text-ink-muted">{TRIGGER[i.triggerType]}</span>
        <span>· cycle {num(i.cycle)}</span>
        <span className="ml-auto">{new Date(i.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink">
        <Rich text={i.text} />
      </p>
      <div className="mt-1.5 flex flex-wrap items-start gap-x-2 gap-y-1 text-[10.5px] text-ink-faint">
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
        <span className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Live insights</span>
        <span className="grow" />
        <Button size="sm" variant="ghost" onClick={() => void summarise()} disabled={busy || !overview?.cycle} className="!h-6">
          {busy ? "Writing…" : "Summarise now"}
        </Button>
      </div>
      {(error ?? insightNotice) && (
        <div className="mx-4 mb-2 rounded-md bg-warning-bg px-2.5 py-1.5 text-[11.5px] text-warning-text">{error ?? insightNotice}</div>
      )}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-3">
        {insights.length === 0 ? (
          <p className="text-[12px] text-ink-faint">
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

export function AdvisorPanel({ onClose }: { onClose: () => void }) {
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
    <aside className="flex h-full w-[340px] shrink-0 flex-col rounded-xl border border-line bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-bg text-accent-text">
          <Icon name="chat" size={14} />
        </div>
        <div className="min-w-0 grow leading-tight">
          <div className="text-[13px] font-semibold text-ink">Advisor</div>
          <div className="truncate text-[11.5px] text-ink-faint">
            {active?.tag ? `${active.tag} · ${active.mode === "cloud" ? "cloud" : "local"}` : "No model selected"}
          </div>
        </div>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clear} disabled={streaming}>
            Clear
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Hide Advisor" className="!h-7 !w-7">
          <Icon name="close" size={14} />
        </Button>
      </header>

      <InsightsFeed />

      <div ref={scrollRef} className="flex min-h-0 grow flex-col gap-2.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="my-auto text-center">
            <div className="text-[13px] font-semibold text-ink">Ask about the live readings</div>
            <p className="mx-auto mt-1 max-w-[250px] text-[12.5px] text-ink-faint">
              The Advisor sees each component's condition, failure probability and the sensor values driving it.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end bg-accent text-white"
                  : m.error
                    ? "self-start border border-critical/30 bg-critical-bg text-critical-text"
                    : "self-start bg-surface-3 text-ink"
              }`}
            >
              {m.role === "assistant" && !m.error && m.text ? <Rich text={m.text} /> : m.text || (m.streaming ? <span className="animate-live text-ink-faint">Thinking…</span> : "")}
              {m.model && !m.streaming && (
                <div className="mt-1.5 flex flex-wrap items-start gap-x-2 gap-y-1 text-[10.5px] text-ink-faint">
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
              className="rounded-full border border-accent-border bg-accent-bg px-2.5 py-1 text-left text-[12px] font-medium text-accent-text hover:brightness-95"
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
          className="max-h-28 min-h-8 grow resize-none rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] text-ink"
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
