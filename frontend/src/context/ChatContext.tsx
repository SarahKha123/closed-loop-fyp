// The Advisor conversation. Each request carries a system prompt built from
// the live overview (current cycle, every component's condition, probability
// and top drivers), so answers are about what the dashboard shows right now.
// The backend picks the model (local or cloud) and caps the history.

import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Overview } from "../lib/api"
import { streamEvents } from "../lib/http"
import type { EventStream } from "../lib/http"
import { useLive } from "./LiveContext"

export interface ChatMessage {
  role: "user" | "assistant"
  text: string
  streaming?: boolean
  error?: boolean
  model?: string
}

type ChatEvent = { phase: "token"; text: string } | { phase: "done"; model: string } | { phase: "error"; error: string }

interface ChatValue {
  /** Whether the Advisor panel is showing. Sending a message opens it. */
  open: boolean
  setOpen: (open: boolean) => void
  messages: ChatMessage[]
  streaming: boolean
  send: (text: string) => void
  stop: () => void
  clear: () => void
}

const ChatContext = createContext<ChatValue | null>(null)

function systemPrompt(o: Overview | null): string {
  const lines = [
    "You are the Advisor in Closed Loop, a predictive-maintenance dashboard for a hydraulic test rig",
    "(UCI Condition Monitoring of Hydraulic Systems dataset, replayed cycle by cycle).",
    "Answer briefly and concretely, as a maintenance engineer's assistant. Use only the values below;",
    "if something isn't in them, say you don't know.",
  ]
  if (!o || !o.cycle) {
    lines.push("No cycles have been replayed yet, so there are no readings.")
    return lines.join(" ")
  }
  lines.push(`\nCurrent cycle: ${o.cycle} of ${o.replay?.total ?? 2205}.`)
  for (const c of o.components) {
    const drivers = c.shap.map((d) => `${d.label} ${d.value} ${d.unit}`).join("; ")
    lines.push(
      `- ${c.component}: ${c.condition} (failure probability ${(c.failureProbability * 100).toFixed(1)}%, confidence ${c.confidence}` +
        `${c.since ? `, since cycle ${c.since}` : ""}${c.changedFrom ? `, changed from ${c.changedFrom}` : ""}). Top drivers: ${drivers}.`,
    )
  }
  lines.push(`Open work orders: ${o.kpis.openWorkOrders}.`)
  return lines.join("\n")
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { overview } = useLive()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Open by default where there is room for it beside the dashboard.
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1500)
  const stream = useRef<EventStream | null>(null)
  const streaming = messages[messages.length - 1]?.streaming ?? false

  const patchLast = (patch: (m: ChatMessage) => ChatMessage) =>
    setMessages((ms) => (ms.length ? [...ms.slice(0, -1), patch(ms[ms.length - 1])] : ms))

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return
      setOpen(true)
      const history = messages.filter((m) => !m.error && m.text).map((m) => ({ role: m.role, content: m.text }))
      setMessages((ms) => [...ms, { role: "user", text: trimmed }, { role: "assistant", text: "", streaming: true }])
      const s = streamEvents<ChatEvent>(
        "/api/chat",
        { messages: [{ role: "system", content: systemPrompt(overview) }, ...history, { role: "user", content: trimmed }] },
        (e) => {
          if (e.phase === "token") patchLast((m) => ({ ...m, text: m.text + e.text }))
          else if (e.phase === "done") patchLast((m) => ({ ...m, streaming: false, model: e.model }))
          else patchLast((m) => ({ ...m, text: e.error, streaming: false, error: true }))
        },
      )
      stream.current = s
      s.done
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") patchLast((m) => ({ ...m, streaming: false }))
          else patchLast((m) => ({ ...m, text: err instanceof Error ? err.message : "could not reach the backend", streaming: false, error: true }))
        })
        .finally(() => {
          stream.current = null
        })
    },
    [messages, overview, streaming],
  )

  const value: ChatValue = {
    open,
    setOpen,
    messages,
    streaming,
    send,
    stop: () => stream.current?.cancel(),
    clear: () => setMessages([]),
  }
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error("useChat must be used within ChatProvider")
  return ctx
}
