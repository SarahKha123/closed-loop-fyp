// The Advisor conversation. The browser keeps the transcript and sends its
// turns; the backend adds the live snapshot, picks the model (local or cloud),
// caps the history, and grounding-checks each answer.

import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Validation } from "../lib/api"
import { streamEvents } from "../lib/http"
import type { EventStream } from "../lib/http"

export interface ChatMessage {
  role: "user" | "assistant"
  text: string
  streaming?: boolean
  error?: boolean
  model?: string
  /** The grounding check's verdict; null when it was off or there was no data yet. */
  grounded?: boolean | null
  validation?: Validation | null
}

type ChatEvent = { phase: "token"; text: string } | { phase: "done"; model: string; grounded: boolean | null; validation: Validation | null } | { phase: "error"; error: string }

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

export function ChatProvider({ children }: { children: ReactNode }) {
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
        { messages: [...history, { role: "user", content: trimmed }] },
        (e) => {
          if (e.phase === "token") patchLast((m) => ({ ...m, text: m.text + e.text }))
          else if (e.phase === "done") patchLast((m) => ({ ...m, streaming: false, model: e.model, grounded: e.grounded, validation: e.validation }))
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
    [messages, streaming],
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
