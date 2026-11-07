// Page guides: the first time someone opens a page, a short walk round it — one part at a time, spotlit, with a
// sentence on what it is for. The very first guide a person sees opens with a welcome to the whole product.
// Remembered per account and page in this browser; the ? in the top bar (or the profile menu) replays the current
// page's guide. Never in study mode: the researcher briefs participants, and a guide would skew task timings.
// A modal <dialog> gives focus trapping and Escape (= skip) for free. Parts are found by their data-tour attribute;
// a step whose part isn't on screen (no data yet, Advisor pinned, …) is shown in the middle instead.

import { useRouterState } from "@tanstack/react-router"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { useAuth } from "../../context/AuthContext"
import { Button } from "../ui/Button"
import { Mark } from "../ui/Icon"

export const TOUR_EVENT = "closed-loop:tour"

type Step = { target?: string; title: string; body: string }

const WELCOME: Step = {
  title: "Welcome to Closed Loop",
  body: "This dashboard watches a hydraulic test rig and tells you which parts are wearing out before they fail. The data is real: 2,205 recorded cycles from a rig at ZeMA in Germany (the UCI hydraulic dataset), played back as if they were arriving live. Each page has a short guide like this one.",
}

const TOURS: Record<string, Step[]> = {
  overview: [
    {
      target: "replay",
      title: "The live replay",
      body: "One cycle is one 60-second run of the rig. A new cycle arrives every few seconds and is scored the moment it lands. Pause, step one cycle, change the speed or jump to a cycle here.",
    },
    {
      target: "rig",
      title: "The rig at a glance",
      body: "The four monitored components, drawn where they sit in the hydraulic circuit. Each shows its condition (Optimal, Degraded or Critical) and the model's failure probability. Click one to see why the model thinks so.",
    },
    {
      target: "components",
      title: "Every component has its own page",
      body: "The condition next to each name updates live. A component's page shows the sensor readings driving its prediction and its full history.",
    },
    {
      target: "work-orders",
      title: "Work orders",
      body: "A Critical prediction opens a work order automatically, and you can raise one by hand. The number is how many are open.",
    },
    {
      target: "advisor",
      title: "The Advisor",
      body: "A language model that explains what changed in plain language and answers questions about the live readings. Every number it states is checked against the data: look for Verified or Unverified under each answer.",
    },
    {
      target: "help",
      title: "You're all set",
      body: "If the replay is paused, press Play to start it. This button replays the guide for whichever page you're on.",
    },
  ],
  "work-orders": [
    {
      title: "Work orders",
      body: "Maintenance requests, one per component. The system raises one when a component is predicted Critical; a person closes it once the work is done.",
    },
    { target: "page-actions", title: "Raise one by hand", body: "For anything the models didn't flag: pick the component and say what maintenance should do." },
    {
      target: "wo-list",
      title: "Close it with what you found",
      body: "Closing asks what was done (repaired, replaced, no action, escalated) and whether the prediction matched what you saw. That answer is how the predictions are checked against reality.",
    },
    { target: "tabs", title: "Queue and history", body: "The queue is the work to do. History lists closed work orders with their outcomes, and how often the predictions were right." },
  ],
  sensors: [
    {
      title: "Sensors",
      body: "The raw readings the models score, from the latest cycle: 17 channels of pressure, motor power, flow, temperature and vibration, plus three efficiency values computed from them.",
    },
    { target: "sensor-filter", title: "Focus on one component", body: "Pick a component to bring forward the sensors most associated with it and fade the rest." },
    {
      target: "sensor-table",
      title: "Four numbers per sensor",
      body: "Each sensor's 60 seconds are summarised as mean, standard deviation, minimum and maximum. Those 68 numbers are exactly what the models see.",
    },
  ],
  component: [
    { title: "One component in depth", body: "Everything the system knows about this component: its prediction, why the model made it, the sensors behind it and how it has changed." },
    { target: "state", title: "Current state", body: "The predicted condition, with the model's probability for each of Optimal, Degraded and Critical, and how confident it is." },
    {
      target: "why",
      title: "Why this prediction",
      body: "The sensor features that pushed the model hardest towards this condition (SHAP values). Longer bars mattered more.",
    },
    { target: "related", title: "Related sensors", body: "The readings most associated with this component, from the latest cycle." },
    { target: "history", title: "History", body: "Failure probability over the recent cycles, and every change of condition." },
    {
      target: "page-actions",
      title: "Act on it",
      body: "Raise a work order for this component, or ask the Advisor to explain its condition in plain language.",
    },
  ],
  models: [
    { target: "model-banner", title: "The model answering now", body: "Which language model writes the Advisor's insights and answers, and whether it is ready." },
    {
      target: "tabs",
      title: "Local or cloud",
      body: "Installed and Download manage models that run on this computer: the data never leaves it, but they are slower. Cloud APIs use a hosted model: faster and more capable, but the readings are sent out. Hardware shows what this machine can run.",
    },
    {
      target: "tabs",
      title: "How the Advisor behaves",
      body: "Settings controls when insights are written, the grounding check on every answer, when work orders open, and email alerts.",
    },
  ],
}

function pageOf(path: string): string | null {
  if (path === "/") return "overview"
  if (path.startsWith("/components/")) return "component"
  const first = path.split("/")[1]
  return first in TOURS ? first : null
}

const PAD = 8 // spotlight margin round the part
const CARD_W = 360
const key = (username: string, page: string) => `closed-loop:tour-done:${username}:${page}`

function isDone(username: string, page: string): boolean {
  try {
    return localStorage.getItem(key(username, page)) === "1"
  } catch {
    return true // storage blocked: don't nag on every load
  }
}

export function Tour({ studyMode }: { studyMode: boolean }) {
  const { user } = useAuth()
  const page = useRouterState({ select: (s) => pageOf(s.location.pathname) })
  const dialog = useRef<HTMLDialogElement>(null)
  // Guides in progress, by page. A page not in here shows its guide only while it hasn't been finished.
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [measured, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const onStart = () => page && setProgress((r) => ({ ...r, [page]: 0 }))
    window.addEventListener(TOUR_EVENT, onStart)
    return () => window.removeEventListener(TOUR_EVENT, onStart)
  }, [page])

  const active = !studyMode && user && page ? page : null
  const steps = active ? (isDone(user!.username, "welcome") ? TOURS[active] : [WELCOME, ...TOURS[active]]) : []
  const step = active ? (progress[active] ?? (isDone(user!.username, active) ? null : 0)) : null
  const s = step == null ? null : steps[step]
  const target = s?.target

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (s && !d.open) d.showModal()
    if (!s && d.open) d.close()
  }, [s])

  // Bring this step's part into view and keep the spotlight on it as the window changes.
  const rect = target ? measured : null
  useLayoutEffect(() => {
    if (!target) return
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
      setRect(el && el.offsetParent !== null ? el.getBoundingClientRect() : null)
    }
    document.querySelector(`[data-tour="${target}"]`)?.scrollIntoView({ block: "nearest" })
    const raf = requestAnimationFrame(measure)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", measure)
    }
  }, [target, step])

  function go(next: number) {
    if (active) setProgress((r) => ({ ...r, [active]: next }))
  }

  function finish() {
    if (!active || !user) return
    try {
      localStorage.setItem(key(user.username, active), "1")
      localStorage.setItem(key(user.username, "welcome"), "1")
    } catch {
      /* not remembered: it shows again next time */
    }
    setProgress((r) => {
      const rest = { ...r }
      delete rest[active]
      return rest
    })
  }

  if (!active) return null
  const last = step === steps.length - 1

  // The card sits beside the spotlit part: below it if there's room, else above, else to its right; centred without one.
  let cardStyle: CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
  if (rect) {
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_W - 16)
    const below = rect.bottom + PAD + 12
    cardStyle =
      below + 260 < window.innerHeight
        ? { left, top: below }
        : rect.top > 300
          ? { left, bottom: window.innerHeight - rect.top + PAD + 12 }
          : { left: Math.min(rect.right + PAD + 12, window.innerWidth - CARD_W - 16), top: Math.max(16, rect.top) }
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault()
        finish()
      }}
      aria-labelledby="tour-title"
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      {/* The dimmed page with a hole over the part: one box whose huge shadow is the dim. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed rounded-lg transition-all duration-300 ease-out motion-reduce:transition-none ${rect ? "ring-2 ring-accent" : ""}`}
        style={
          rect
            ? { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)" }
            : { left: "50%", top: "50%", width: 0, height: 0, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)" }
        }
      />
      {s && (
        <div
          key={`${active}-${step}`}
          className="animate-toast-in fixed flex flex-col gap-3 rounded-xl border border-line-strong bg-surface p-5 shadow-pop"
          style={{ ...cardStyle, width: `min(${CARD_W}px, calc(100vw - 32px))` }}
        >
          {s === WELCOME && <Mark size={28} />}
          <div>
            <h2 id="tour-title" className="text-xl font-semibold">
              {s.title}
            </h2>
            <p className="mt-1.5 text-base text-ink-muted">{s.body}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress: one bar per step, the current one in the accent. */}
            <div className="flex grow gap-1" aria-label={`Step ${step! + 1} of ${steps.length}`} role="img">
              {steps.map((_, i) => (
                <span key={i} className={`h-1 w-4 rounded-full ${i === step ? "bg-accent" : i < step! ? "bg-ink-faint" : "bg-surface-3"}`} />
              ))}
            </div>
            {!last && (
              <Button size="sm" variant="ghost" onClick={finish}>
                Skip
              </Button>
            )}
            {step! > 0 && (
              <Button size="sm" variant="secondary" onClick={() => go(step! - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" variant="primary" autoFocus onClick={() => (last ? finish() : go(step! + 1))}>
              {s === WELCOME ? "Show me around" : last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
