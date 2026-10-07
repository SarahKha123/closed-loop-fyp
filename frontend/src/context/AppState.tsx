// The dashboard's shared state: selected cycle, derived work orders and
// KPIs, toasts, and the Advisor transcript. State changes live in
// appReducer.ts; this file wires them to React and streams chat replies.

import { createContext, useCallback, useContext, useMemo, useReducer } from "react"
import type { ReactNode } from "react"
import { buildSystemPrompt, explanationFor } from "../domain/advisor"
import { cycles } from "../domain/demo-data"
import { getCycle, getKpiTiles, getWorkOrders } from "../domain/maintenance"
import type { ChatMessage, Cycle, KpiTile, Toast, WorkOrder } from "../domain/types"
import { streamEvents } from "../lib/http"
import { appReducer, initialState } from "./appReducer"

/** Frames from POST /api/chat — see docs/API.md. */
type ChatEvent = { phase: "token"; text: string } | { phase: "done"; model: string } | { phase: "error"; error: string }

interface AppStateValue {
  selectedCycleId: number
  cycle: Cycle
  cycles: Cycle[]
  workOrders: WorkOrder[]
  kpiTiles: KpiTile[]
  messages: ChatMessage[]
  toasts: Toast[]
  setCycle: (id: number) => void
  askAbout: (componentName: string) => void
  hasAskedCurrent: boolean
  dismissToast: (id: number) => void
  sendChat: (text: string) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

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
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const history = state.messages
        .filter((m) => !m.error && m.text)
        .map((m) => ({ role: m.role, content: m.text }))

      dispatch({ type: "SEND_MESSAGE", text: trimmed })

      streamEvents<ChatEvent>(
        "/api/chat",
        {
          // No model: the backend answers with whatever the Models page made active, local or cloud.
          messages: [{ role: "system", content: buildSystemPrompt(cycle) }, ...history, { role: "user", content: trimmed }],
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
