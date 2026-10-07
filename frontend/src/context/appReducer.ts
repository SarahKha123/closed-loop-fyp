// Every state change in the dashboard, as one pure reducer: switching cycle
// (which announces new and resolved work orders), the canned "why flagged?"
// answer, toasts, and the streamed Advisor chat.

import { welcomeMessages } from "../domain/advisor"
import { TOTAL_CYCLES, defaultCycleId } from "../domain/demo-data"
import { getCycle } from "../domain/maintenance"
import type { ChatMessage, Toast } from "../domain/types"

export interface State {
  selectedCycleId: number
  messages: ChatMessage[]
  announced: Set<string>
  askedWorkOrders: Set<string>
  toasts: Toast[]
}

export type Action =
  | { type: "SET_CYCLE"; id: number }
  | { type: "ASK"; woId: string; question: string; answer: string }
  | { type: "DISMISS_TOAST"; id: number }
  | { type: "SEND_MESSAGE"; text: string }
  | { type: "APPEND_TOKEN"; text: string }
  | { type: "STREAM_DONE" }
  | { type: "STREAM_ERROR"; error: string }

const defaultCycle = getCycle(defaultCycleId)

export const initialState: State = {
  selectedCycleId: defaultCycleId,
  messages: welcomeMessages(defaultCycle),
  // The default cycle's work order is already in the welcome messages; don't announce it twice.
  announced: new Set(defaultCycle.newWorkOrder ? [`open:${defaultCycle.newWorkOrder.id}`] : []),
  askedWorkOrders: new Set(),
  toasts: [],
}

let toastSeq = 0

export function appReducer(state: State, action: Action): State {
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
          text: `Batch processed — cycle ${cycle.id.toLocaleString()} of ${TOTAL_CYCLES.toLocaleString()}. Work order ${cycle.newWorkOrder.id} was opened automatically for the ${cycle.newWorkOrder.component.toLowerCase()}.`,
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
