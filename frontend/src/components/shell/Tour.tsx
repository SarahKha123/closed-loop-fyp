// The welcome tour: on a person's first sign-in, a short walk round the dashboard — what it is, then one part at a
// time, spotlit, with a sentence on what it is for. Remembered per account in this browser; "Take the tour" in the
// profile menu starts it again. Never in study mode: the researcher briefs participants, and a tour would skew timings.
// A modal <dialog> gives focus trapping and Escape (= skip) for free. Parts are found by their data-tour attribute;
// a step whose part isn't on screen (e.g. the Advisor toggle when the Advisor is pinned) is shown in the middle.

import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { useAuth } from "../../context/AuthContext"
import { Button } from "../ui/Button"
import { Mark } from "../ui/Icon"

export const TOUR_EVENT = "closed-loop:tour"

const STEPS: { target?: string; title: string; body: string }[] = [
  {
    title: "Welcome to Closed Loop",
    body: "This dashboard watches a hydraulic test rig and tells you which parts are wearing out before they fail. The data is real: 2,205 recorded cycles from a rig at ZeMA in Germany (the UCI hydraulic dataset), played back as if they were arriving live. This tour takes a minute.",
  },
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
    body: "A Critical prediction opens a work order automatically, and you can raise one by hand. When maintenance is done, close it and record whether the prediction matched what you found.",
  },
  {
    target: "advisor",
    title: "The Advisor",
    body: "A language model that explains what changed in plain language and answers questions about the live readings. Every number it states is checked against the data: look for Verified or Unverified under each answer.",
  },
  {
    title: "You're all set",
    body: "If the replay is paused, press Play in the top bar to start it. You can take this tour again from your profile menu at the bottom of the sidebar.",
  },
]

const PAD = 8 // spotlight margin round the part
const CARD_W = 360

function storageKey(username: string) {
  return `closed-loop:tour-done:${username}`
}

export function Tour({ studyMode }: { studyMode: boolean }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  // First sign-in on this browser: open on the welcome step. Later: only from the profile menu.
  const [step, setStep] = useState<number | null>(() => {
    if (studyMode || !user) return null
    try {
      return localStorage.getItem(storageKey(user.username)) === "1" ? null : 0
    } catch {
      return null // storage blocked: don't nag on every load
    }
  })
  const [measured, setRect] = useState<DOMRect | null>(null)

  const start = useCallback(() => {
    void navigate({ to: "/" }) // every part the tour points at is on the overview
    setStep(0)
  }, [navigate])

  useEffect(() => {
    const onStart = () => !studyMode && start()
    window.addEventListener(TOUR_EVENT, onStart)
    return () => window.removeEventListener(TOUR_EVENT, onStart)
  }, [studyMode, start])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (step != null && !d.open) d.showModal()
    if (step == null && d.open) d.close()
  }, [step])

  // Find this step's part, bring it into view, and keep the spotlight on it as the window changes.
  const target = step == null ? undefined : STEPS[step].target
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
  }, [target])

  function finish() {
    try {
      if (user) localStorage.setItem(storageKey(user.username), "1")
    } catch {
      /* not remembered: it shows again next time */
    }
    setStep(null)
  }

  if (studyMode) return null
  const s = step == null ? null : STEPS[step]
  const last = step === STEPS.length - 1

  // The card sits beside the spotlit part: below it if there's room, otherwise above; centred when there's no part.
  let cardStyle: CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
  if (rect) {
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_W - 16)
    const below = rect.bottom + PAD + 12
    cardStyle =
      below + 260 < window.innerHeight
        ? { left, top: below }
        : rect.top > 300
          ? { left, bottom: window.innerHeight - rect.top + PAD + 12 }
          : { left: Math.min(rect.right + PAD + 12, window.innerWidth - CARD_W - 16), top: Math.max(16, rect.top) } // tall part: beside it
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
          key={step}
          className="animate-toast-in fixed flex flex-col gap-3 rounded-xl border border-line-strong bg-surface p-5 shadow-pop"
          style={{ ...cardStyle, width: `min(${CARD_W}px, calc(100vw - 32px))` }}
        >
          {step === 0 && <Mark size={28} />}
          <div>
            <h2 id="tour-title" className="text-xl font-semibold">
              {s.title}
            </h2>
            <p className="mt-1.5 text-base text-ink-muted">{s.body}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress: one bar per step, the current one in the accent. */}
            <div className="flex grow gap-1" aria-label={`Step ${step! + 1} of ${STEPS.length}`} role="img">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1 w-4 rounded-full ${i === step ? "bg-accent" : i < step! ? "bg-ink-faint" : "bg-surface-3"}`} />
              ))}
            </div>
            {!last && (
              <Button size="sm" variant="ghost" onClick={finish}>
                Skip
              </Button>
            )}
            {step! > 0 && !last && (
              <Button size="sm" variant="secondary" onClick={() => setStep(step! - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" variant="primary" autoFocus onClick={() => {
                if (last) return finish()
                if (step === 0) void navigate({ to: "/" }) // every part the tour points at is on the overview
                setStep(step! + 1)
              }}>
              {step === 0 ? "Show me around" : last ? "Start exploring" : "Next"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
