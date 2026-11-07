// The live dashboard state: replay position, the overview (KPIs + each
// component's latest prediction), the risk trend and recent condition changes.
// Loaded once, then refreshed whenever the stream says something changed
// (throttled, so a fast replay doesn't flood the API). Also turns condition
// changes into toasts, and exposes the replay controls. Also holds the
// Advisor's live insights (newest first) and its "insights paused" notice,
// and the runtime settings (study mode changes what the shell shows).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../lib/api"
import type { ConditionEvent, Insight, Overview, ReplayState, Settings, Trend } from "../lib/api"
import { conditionRank } from "../lib/status"
import { onStatus, subscribe } from "../lib/stream"
import type { StreamStatus } from "../lib/stream"

export const TREND_WINDOW = 200
const REFRESH_EVERY_MS = 400

export interface Toast {
  id: number
  title: string
  detail?: string
  tone: "critical" | "warning" | "good" | "info"
}

interface LiveValue {
  overview: Overview | null
  trend: Trend | null
  events: ConditionEvent[]
  replay: ReplayState | null
  connection: StreamStatus
  loading: boolean
  error: string | null
  toasts: Toast[]
  insights: Insight[]
  /** "Insights paused: …" — set when the engine can't reach a model, cleared by the next insight. */
  insightNotice: string | null
  /** null until loaded; kept current by `settings` events (a change in any tab). */
  settings: Settings | null
  dismissToast: (id: number) => void
  /** Show a notice in the top bar (e.g. an action that failed). */
  pushToast: (t: Omit<Toast, "id">) => void
  control: {
    play: () => Promise<void>
    pause: () => Promise<void>
    step: () => Promise<void>
    reset: (cycle?: number) => Promise<void>
    speed: (seconds: number) => Promise<void>
    seek: (cycle: number) => Promise<void>
  }
  controlError: string | null
}

const LiveContext = createContext<LiveValue | null>(null)
let toastSeq = 0

export function LiveProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [trend, setTrend] = useState<Trend | null>(null)
  const [events, setEvents] = useState<ConditionEvent[]>([])
  const [replay, setReplay] = useState<ReplayState | null>(null)
  const [connection, setConnection] = useState<StreamStatus>("connecting")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [controlError, setControlError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightNotice, setInsightNotice] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

  const pending = useRef<number | null>(null)
  const lastRun = useRef(0)

  const refresh = useCallback(async () => {
    lastRun.current = Date.now()
    try {
      const [ov, tr, ev] = await Promise.all([api.overview(), api.trend(TREND_WINDOW), api.events(30)])
      setOverview(ov)
      setTrend(tr)
      setEvents(ev.events)
      if (ov.replay) setReplay(ov.replay)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not reach the backend")
    } finally {
      setLoading(false)
    }
  }, [])

  // Throttle: at most one refresh per REFRESH_EVERY_MS, always ending with a fresh one.
  const scheduleRefresh = useCallback(() => {
    if (pending.current != null) return
    const wait = Math.max(0, REFRESH_EVERY_MS - (Date.now() - lastRun.current))
    pending.current = window.setTimeout(() => {
      pending.current = null
      void refresh()
    }, wait)
  }, [refresh])

  // Seeking back erases insights about the erased cycles, so a replay change refetches them.
  const loadInsights = useCallback(() => {
    api
      .insights()
      .then((r) => setInsights(r.insights))
      .catch(() => {
        /* the overview's error already says the backend is down */
      })
  }, [])

  const loadSettings = useCallback(() => {
    api
      .settings()
      .then(setSettings)
      .catch(() => {
        /* as above */
      })
  }, [])

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    setToasts((ts) => [...ts.slice(-3), { ...t, id: ++toastSeq }])
  }, [])

  useEffect(() => {
    void refresh()
    loadInsights()
    loadSettings()
    const offStatus = onStatus(setConnection)
    const off = subscribe((e) => {
      if (e.type === "replay") {
        const { type: _type, ...state } = e
        setReplay(state)
        scheduleRefresh()
        loadInsights()
      } else if (e.type === "prediction") {
        scheduleRefresh()
        for (const p of e.predictions) {
          if (!p.changedFrom) continue
          const worse =
            conditionRank[p.condition as keyof typeof conditionRank] > conditionRank[p.changedFrom as keyof typeof conditionRank]
          pushToast({
            title: `${p.component}: ${p.changedFrom} → ${p.condition}`,
            detail: `Cycle ${e.cycle.toLocaleString("en-US")}`,
            tone: !worse ? "good" : p.condition === "Critical" ? "critical" : "warning",
          })
        }
      } else if (e.type === "work_order") {
        scheduleRefresh()
        pushToast({
          title: `${e.workOrder.id} ${e.action} — ${e.workOrder.component}`,
          tone: e.action === "opened" ? "critical" : "good",
        })
      } else if (e.type === "insight") {
        setInsights((xs) => [e.insight, ...xs.filter((x) => x.id !== e.insight.id)].slice(0, 50))
        setInsightNotice(null)
      } else if (e.type === "insight_notice") {
        setInsightNotice(e.text)
      } else if (e.type === "settings") {
        setSettings(e.settings)
      } else if (e.type === "reconnected") {
        void refresh()
        loadInsights()
        loadSettings()
      }
    })
    return () => {
      off()
      offStatus()
      if (pending.current != null) window.clearTimeout(pending.current)
    }
  }, [refresh, scheduleRefresh, pushToast, loadInsights, loadSettings])

  const run = useCallback(
    async (action: () => Promise<ReplayState>) => {
      try {
        setReplay(await action())
        setControlError(null)
        scheduleRefresh()
      } catch (err) {
        setControlError(err instanceof Error ? err.message : "the replay did not respond")
      }
    },
    [scheduleRefresh],
  )

  const control = {
    play: () => run(api.replay.play),
    pause: () => run(api.replay.pause),
    step: () => run(api.replay.step),
    reset: (cycle?: number) => run(() => api.replay.reset(cycle)),
    speed: (seconds: number) => run(() => api.replay.speed(seconds)),
    seek: (cycle: number) => run(() => api.replay.seek(cycle)),
  }

  const value: LiveValue = {
    overview,
    trend,
    events,
    replay,
    connection,
    loading,
    error,
    toasts,
    insights,
    insightNotice,
    settings,
    dismissToast: (id) => setToasts((ts) => ts.filter((t) => t.id !== id)),
    pushToast,
    control,
    controlError,
  }
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive() {
  const ctx = useContext(LiveContext)
  if (!ctx) throw new Error("useLive must be used within LiveProvider")
  return ctx
}
