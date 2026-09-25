import { useEffect } from "react"
import { useAppState } from "../context/AppState"

interface ToastItemProps {
  id: number
  text: string
  tone: "critical" | "good"
  onDismiss: (id: number) => void
}

function ToastItem({ id, text, tone, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(id), 4000)
    return () => clearTimeout(t)
  }, [id, onDismiss])

  return (
    <div
      className={`animate-toast-in flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium shadow-lg ${
        tone === "critical" ? "border-critical-text/20 bg-critical-bg text-critical-text" : "border-good-text/20 bg-good-bg text-good-text"
      }`}
    >
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone === "critical" ? "bg-critical" : "bg-good"}`} />
      {text}
    </div>
  )
}

export function ToastStack() {
  const { toasts, dismissToast } = useAppState()
  if (!toasts.length) return null

  return (
    <div className="fixed right-6 bottom-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} text={t.text} tone={t.tone} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
