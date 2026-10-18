// Notifications in the bottom-right of the page column (never over the Advisor) for condition changes and work orders; each closes itself after 5 s.

import { useEffect } from "react"
import { useLive } from "../../context/LiveContext"
import type { Toast } from "../../context/LiveContext"
import { Icon } from "../ui/Icon"

const tones: Record<Toast["tone"], { bar: string; icon: "octagon" | "alert" | "check" | "activity"; iconColor: string }> = {
  critical: { bar: "bg-critical", icon: "octagon", iconColor: "text-critical-text" },
  warning: { bar: "bg-warning", icon: "alert", iconColor: "text-warning-text" },
  good: { bar: "bg-good", icon: "check", iconColor: "text-good-text" },
  info: { bar: "bg-accent", icon: "activity", iconColor: "text-accent-text" },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), 5000)
    return () => window.clearTimeout(t)
  }, [toast.id, onDismiss])
  const tone = tones[toast.tone]
  return (
    <div role="status" className="animate-toast-in pointer-events-auto flex w-[360px] max-w-full overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
      <span className={`w-1 shrink-0 ${tone.bar}`} />
      <div className="flex grow items-start gap-2.5 px-3 py-2.5">
        <Icon name={tone.icon} size={15} className={`mt-0.5 ${tone.iconColor}`} />
        <div className="min-w-0 grow">
          <div className="text-base font-semibold text-ink">{toast.title}</div>
          {toast.detail && <div className="text-sm text-ink-faint">{toast.detail}</div>}
        </div>
        <button type="button" onClick={() => onDismiss(toast.id)} className="text-ink-faint hover:text-ink" aria-label="Dismiss">
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  )
}

export function ToastStack() {
  const { toasts, dismissToast } = useLive()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none absolute right-2 bottom-2 z-50 flex max-w-[calc(100%-1rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
