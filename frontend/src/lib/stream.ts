// One shared connection to GET /api/stream for the whole app. Components
// subscribe to event types; the browser's EventSource reconnects by itself,
// and on reconnect listeners get a synthetic "reconnected" event so they can
// refetch anything missed while offline.

import type { ReplayState } from "./api"

export type StreamStatus = "connecting" | "open" | "offline"

export type StreamEvent =
  | ({ type: "replay" } & ReplayState)
  | { type: "cycle"; cycle: number; readingId: number }
  | {
      type: "prediction"
      cycle: number
      predictions: {
        component: string
        condition: string
        failureProbability: number
        changedFrom: string | null
      }[]
    }
  | { type: "work_order"; action: "opened" | "closed"; workOrder: { id: string; component: string } }
  | { type: "insight"; insight: unknown }
  | { type: "reconnected" }

type Listener = (event: StreamEvent) => void
type StatusListener = (status: StreamStatus) => void

const listeners = new Set<Listener>()
const statusListeners = new Set<StatusListener>()
let source: EventSource | null = null
let status: StreamStatus = "connecting"
let everOpened = false

function setStatus(next: StreamStatus) {
  status = next
  statusListeners.forEach((l) => l(next))
}

function connect() {
  if (source) return
  source = new EventSource("/api/stream")
  source.onopen = () => {
    if (everOpened) listeners.forEach((l) => l({ type: "reconnected" }))
    everOpened = true
    setStatus("open")
  }
  source.onerror = () => setStatus(source?.readyState === EventSource.CLOSED ? "offline" : "connecting")
  source.onmessage = (msg) => {
    let event: StreamEvent
    try {
      event = JSON.parse(msg.data) as StreamEvent
    } catch {
      return
    }
    listeners.forEach((l) => l(event))
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  connect()
  return () => listeners.delete(listener)
}

export function onStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  listener(status)
  return () => statusListeners.delete(listener)
}
