import { createContext, useCallback, useContext, useMemo, useReducer } from "react"
import type { ReactNode } from "react"
import type { ChatMessage } from "../data"
import { cycles, defaultCycleId, explanationFor, getCycle, getKpiTiles, getWorkOrders } from "../cycles"
import { streamEvents } from "../lib/http"

interface Toast {
  id: number
  text: string
  tone: "critical" | "good"
}

interface State {
  selectedCycleId: number
  messages: ChatMessage[]
  announced: Set<string>
  askedWorkOrders: Set<string>
  toasts: Toast[]
}

type ChatEvent = { phase: "token"; text: string } | { phase: "done"; model: string } | { phase: "error"; error: string }

type Action =
  | { type: "SET_CYCLE"; id: number }
  | { type: "ASK"; woId: string; question: string; answer: string }
  | { type: "DISMISS_TOAST"; id: number }
  | { type: "SEND_MESSAGE"; text: string }
  | { type: "APPEND_TOKEN"; text: string }
  | { type: "STREAM_DONE" }
  | { type: "STREAM_ERROR"; error: string }

const initialMessages: ChatMessage[] = [
  { role: "assistant", text: "Latest batch processed — cycle 1,465 of 2,205. 1 component flagged for review." },
  { role: "assistant", text: "Work order WO-0442 was opened automatically for the accumulator." },
]

const initialState: State = {
  selectedCycleId: defaultCycleId,
  messages: initialMessages,
  announced: new Set(["open:WO-0442"]),
  askedWorkOrders: new Set(),
  toasts: [],
}

let toastSeq = 0

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_CYCLE": {
      const cycle = getCycle(action.id)
      const announced = new Set(state.announced)
      const messages = [...state.messages]
      const toasts = [...state.toasts]

      if (cycle.newWorkOrder && !announced.has(`open:${cycle.newWorkOrder.id}`)) {
        announced.add(`open:${cycle.newWorkOrder.id}`)
        messages.push({
          role: "assistant",
          text: `Batch processed — cycle ${cycle.id.toLocaleString()} of 2,205. Work order ${cycle.newWorkOrder.id} was opened automatically for the ${cycle.newWorkOrder.component.toLowerCase()}.`,
        })
        toasts.push({ id: ++toastSeq, text: `${cycle.newWorkOrder.id} created — ${cycle.newWorkOrder.component} flagged`, tone: "critical" })
      }

      if (cycle.closesWorkOrderIds) {
        for (const id of cycle.closesWorkOrderIds) {
          if (announced.has(`close:${id}`)) continue
          announced.add(`close:${id}`)
          messages.push({ role: "assistant", text: `${id} marked resolved after maintenance.` })
          toasts.push({ id: ++toastSeq, text: `${id} resolved`, tone: "good" })
        }
      }

      return { ...state, selectedCycleId: action.id, messages, announced, toasts }
    }
    case "ASK": {
      if (state.askedWorkOrders.has(action.woId)) return state
      const askedWorkOrders = new Set(state.askedWorkOrders)
      askedWorkOrders.add(action.woId)
      return {
        ...state,
        askedWorkOrders,
        messages: [...state.messages, { role: "user", text: action.question }, { role: "assistant", text: action.answer }],
      }
    }
    case "DISMISS_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }
    case "SEND_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, { role: "user", text: action.text }, { role: "assistant", text: "", streaming: true }],
      }
    case "APPEND_TOKEN": {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (!last || last.role !== "assistant") return state
      messages[messages.length - 1] = { ...last, text: last.text + action.text }
      return { ...state, messages }
    }
    case "STREAM_DONE": {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (!last || last.role !== "assistant") return state
      messages[messages.length - 1] = { ...last, streaming: false }
      return { ...state, messages }
    }
    case "STREAM_ERROR": {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (!last || last.role !== "assistant") return state
      messages[messages.length - 1] = { ...last, text: action.error, streaming: false, error: true }
      return { ...state, messages }
    }
  }
}

interface AppStateValue {
  selectedCycleId: number
  cycle: ReturnType<typeof getCycle>
  cycles: typeof cycles
  workOrders: ReturnType<typeof getWorkOrders>
  kpiTiles: ReturnType<typeof getKpiTiles>
  messages: ChatMessage[]
  toasts: Toast[]
  setCycle: (id: number) => void
  askAbout: (componentName: string) => void
  hasAskedCurrent: boolean
  dismissToast: (id: number) => void
  sendChat: (text: string, model?: string | null) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const cycle = useMemo(() => getCycle(state.selectedCycleId), [state.selectedCycleId])
  const workOrders = useMemo(() => getWorkOrders(state.selectedCycleId), [state.selectedCycleId])
  const kpiTiles = useMemo(() => getKpiTiles(state.selectedCycleId), [state.selectedCycleId])

  const setCycle = useCallback((id: number) => dispatch({ type: "SET_CYCLE", id }), [])
  const dismissToast = useCallback((id: number) => dispatch({ type: "DISMISS_TOAST", id }), [])

  const currentWorkOrder = cycle.flaggedComponent
    ? workOrders.find((w) => w.component === cycle.flaggedComponent && w.status === "Open")
    : undefined

  const askAbout = useCallback(
    (componentName: string) => {
      const wo = workOrders.find((w) => w.component === componentName && w.status === "Open")
      if (!wo) return
      const reading = cycle.components.find((c) => c.name === componentName)
      const value = reading?.value ?? ""
      dispatch({
        type: "ASK",
        woId: wo.id,
        question: `Why is the ${componentName.toLowerCase()} flagged?`,
        answer: explanationFor(componentName, value, wo.id),
      })
    },
    [workOrders, cycle],
  )

  const hasAskedCurrent = currentWorkOrder ? state.askedWorkOrders.has(currentWorkOrder.id) : true

  const sendChat = useCallback(
    (text: string, model?: string | null) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const history = state.messages
        .filter((m) => !m.error && m.text)
        .map((m) => ({ role: m.role, content: m.text }))

      const flagged = cycle.flaggedComponent
      const context = [
        "You are the Advisor panel embedded in Closed Loop, a predictive-maintenance dashboard for a hydraulic test rig (UCI hydraulic condition monitoring dataset).",
        `Current batch cycle: ${cycle.id.toLocaleString()}.`,
        `Component readings: ${cycle.components.map((c) => `${c.name} — ${c.value} (${c.statusLabel})`).join("; ")}.`,
        flagged ? `Flagged component: ${flagged}.` : "No component is currently flagged.",
        "Answer briefly and concretely, in the voice of a maintenance engineer's assistant.",
      ].join(" ")

      dispatch({ type: "SEND_MESSAGE", text: trimmed })

      streamEvents<ChatEvent>(
        "/api/chat",
        {
          messages: [{ role: "system", content: context }, ...history, { role: "user", content: trimmed }],
          model: model ?? undefined,
        },
        (event) => {
          if (event.phase === "token") dispatch({ type: "APPEND_TOKEN", text: event.text })
          else if (event.phase === "done") dispatch({ type: "STREAM_DONE" })
          else if (event.phase === "error") dispatch({ type: "STREAM_ERROR", error: event.error })
        },
      ).done.catch((err: unknown) => {
        dispatch({ type: "STREAM_ERROR", error: err instanceof Error ? err.message : "could not reach the backend" })
      })
    },
    [state.messages, cycle],
  )

  const value: AppStateValue = {
    selectedCycleId: state.selectedCycleId,
    cycle,
    cycles,
    workOrders,
    kpiTiles,
    messages: state.messages,
    toasts: state.toasts,
    setCycle,
    askAbout,
    hasAskedCurrent,
    dismissToast,
    sendChat,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider")
  return ctx
}
