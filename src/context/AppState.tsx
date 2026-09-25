import { createContext, useCallback, useContext, useMemo, useReducer } from "react"
import type { ReactNode } from "react"
import type { ChatMessage } from "../data"
import { cycles, defaultCycleId, explanationFor, getCycle, getKpiTiles, getWorkOrders } from "../cycles"

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
  showComparison: boolean
}

type Action =
  | { type: "SET_CYCLE"; id: number }
  | { type: "ASK"; woId: string; question: string; answer: string }
  | { type: "DISMISS_TOAST"; id: number }
  | { type: "TOGGLE_COMPARISON" }

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
  showComparison: false,
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
    case "TOGGLE_COMPARISON":
      return { ...state, showComparison: !state.showComparison }
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
  showComparison: boolean
  setCycle: (id: number) => void
  askAbout: (componentName: string) => void
  hasAskedCurrent: boolean
  dismissToast: (id: number) => void
  toggleComparison: () => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const cycle = useMemo(() => getCycle(state.selectedCycleId), [state.selectedCycleId])
  const workOrders = useMemo(() => getWorkOrders(state.selectedCycleId), [state.selectedCycleId])
  const kpiTiles = useMemo(() => getKpiTiles(state.selectedCycleId), [state.selectedCycleId])

  const setCycle = useCallback((id: number) => dispatch({ type: "SET_CYCLE", id }), [])
  const dismissToast = useCallback((id: number) => dispatch({ type: "DISMISS_TOAST", id }), [])
  const toggleComparison = useCallback(() => dispatch({ type: "TOGGLE_COMPARISON" }), [])

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

  const value: AppStateValue = {
    selectedCycleId: state.selectedCycleId,
    cycle,
    cycles,
    workOrders,
    kpiTiles,
    messages: state.messages,
    toasts: state.toasts,
    showComparison: state.showComparison,
    setCycle,
    askAbout,
    hasAskedCurrent,
    dismissToast,
    toggleComparison,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider")
  return ctx
}
