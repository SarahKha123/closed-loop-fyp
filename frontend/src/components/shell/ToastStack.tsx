// Condition-change and work-order notices, shown in the top bar's free middle so they never cover a page.
// One line at a time: the newest notice, with a count of the others still showing. Each clears itself after 5 s.

import { useEffect, useRef } from "react"
import { useLive } from "../../context/LiveContext"
import type { Toast } from "../../context/LiveContext"
import { Icon } from "../ui/Icon"

const tones: Record<Toast["tone"], { bg: string; text: string; icon: "octagon" | "alert" | "check" | "activity" }> = {
  critical: { bg: "bg-critical-bg", text: "text-critical-text", icon: "octagon" },
  warning: { bg: "bg-warning-bg", text: "text-warning-text", icon: "alert" },
  good: { bg: "bg-good-bg", text: "text-good-text", icon: "check" },
  info: { bg: "bg-accent-bg", text: "text-accent-text", icon: "activity" },
}

export function ToastStack() {
  const { toasts, dismissToast } = useLive()
  const timed = useRef(new Set<number>())

  // Each notice lives 5 s from when it arrived, whether or not it's the one on show.
  useEffect(() => {
    for (const t of toasts) {
      if (timed.current.has(t.id)) continue
      timed.current.add(t.id)
      window.setTimeout(() => dismissToast(t.id), 5000)
    }
  }, [toasts, dismissToast])

  const t = toasts.at(-1)
  return (
    <div aria-live="polite" className="flex min-w-0 justify-center">
      {t && (
        <div
          key={t.id}
          role="status"
          className={`animate-toast-in flex h-9 max-w-[520px] min-w-0 items-center gap-2 rounded-lg pr-1 pl-3 ${tones[t.tone].bg}`}
        >
          <Icon name={tones[t.tone].icon} size={15} className={`shrink-0 ${tones[t.tone].text}`} />
          <span className="truncate text-sm font-semibold text-ink" title={t.title}>{t.title}</span>
          {t.detail && <span className="shrink-0 text-sm text-ink-muted max-lg:hidden">{t.detail}</span>}
          {toasts.length > 1 && <span className="tabular shrink-0 text-sm text-ink-muted">+{toasts.length - 1}</span>}
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
