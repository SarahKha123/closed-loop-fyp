// The right-hand Advisor: chat about the live readings, answered by the active local or cloud model.

import { useEffect, useRef, useState } from "react"
import { useChat } from "../../context/ChatContext"
import { useLive } from "../../context/LiveContext"
import { useModels } from "../../context/ModelsContext"
import { Button } from "../ui/Button"
import { Icon } from "../ui/Icon"

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
              {m.text || (m.streaming ? <span className="animate-live text-ink-faint">Thinking…</span> : "")}
              {m.model && !m.streaming && <div className="mt-1 text-[10.5px] text-ink-faint">{m.model}</div>}
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
