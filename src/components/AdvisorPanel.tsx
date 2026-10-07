import { useEffect, useRef, useState } from "react"
import { useAppState } from "../context/AppState"

export function AdvisorPanel() {
  const { cycle, messages, askAbout, hasAskedCurrent, sendChat } = useAppState()
  const flagged = cycle.flaggedComponent
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const isStreaming = messages[messages.length - 1]?.streaming ?? false

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  function send() {
    if (!input.trim() || isStreaming) return
    sendChat(input)
    setInput("")
  }

  return (
    <div className="flex max-h-full w-[360px] shrink-0 self-start flex-col gap-3.5 rounded-2xl border border-ink/10 bg-surface p-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          <div className="text-[20px] font-bold">Advisor</div>
        </div>
        <div className="mt-1 text-[17.5px] text-ink-faint">Ask about any reading or work order</div>
      </div>

      <div ref={scrollRef} className="flex min-h-[160px] grow flex-col gap-2.5 overflow-y-auto pr-1">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-[18px] leading-relaxed ${
              msg.role === "assistant"
                ? msg.error
                  ? "self-start bg-critical-bg text-critical-text"
                  : "self-start bg-[#F3F2EE] text-ink"
                : "self-end bg-accent-bg text-ink"
            }`}
          >
            {msg.text || (msg.streaming ? "…" : "")}
          </div>
        ))}
      </div>

      {flagged && !hasAskedCurrent && (
        <button
          type="button"
          onClick={() => askAbout(flagged)}
          className="self-start rounded-full border border-accent-border bg-accent-bg px-3.5 py-2 text-[17.5px] font-semibold text-accent-text"
        >
          Why is the {flagged.toLowerCase()} flagged?
        </button>
      )}

      <div className="flex gap-2 border-t border-ink/10 pt-3.5">
        <label htmlFor="advisor-input" className="sr-only">
          Message
        </label>
        <input
          id="advisor-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send()
          }}
          placeholder="Ask about a component, a reading…"
          className="min-w-0 grow rounded-[10px] border border-ink/15 px-3 py-2.5 text-[18px]"
        />
        <button
          type="button"
          aria-label="Send"
          onClick={send}
          disabled={!input.trim() || isStreaming}
          className="rounded-[10px] bg-accent px-4 text-[18px] font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
