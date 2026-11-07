// First-run prompt when this user has no key of their own yet, so their Advisor chat can't answer.
// Points at the AI model page. Shown until dismissed for the browser session; never in study mode
// or on the AI model page itself.

import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useState } from "react"
import { useModels } from "../../context/ModelsContext"
import { Button } from "../ui/Button"
import { Icon } from "../ui/Icon"

const DISMISSED_KEY = "closed-loop:no-model-dismissed"

function wasDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

export function NoModelDialog({ studyMode }: { studyMode: boolean }) {
  const { active, loading } = useModels()
  const navigate = useNavigate()
  const onModelsPage = useRouterState({ select: (s) => s.location.pathname.startsWith("/models") })
  const [dismissed, setDismissed] = useState(wasDismissed)

  // `active` is null when the backend itself is unreachable — a different problem, not this one.
  if (dismissed || loading || studyMode || onModelsPage || !active || active.resolved) return null

  const close = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // Storage blocked: the dialog just comes back on the next reload.
    }
    setDismissed(true)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-model-title"
        aria-describedby="no-model-body"
        className="w-full max-w-[440px] rounded-xl border border-line bg-surface p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <div className="flex items-start gap-3">
          <h2 id="no-model-title" className="grow text-lg font-semibold text-ink">
            Add your API key
          </h2>
          <button type="button" onClick={close} className="text-ink-faint hover:text-ink" aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        <p id="no-model-body" className="mt-2 text-base text-ink-muted">
          Your Advisor chat answers with your own cloud API key, linked to your account and stored encrypted on
          the server. Add one for any provider; Groq and Google Gemini both offer free keys.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Not now
          </Button>
          <Button
            variant="primary"
            autoFocus
            onClick={() => {
              close()
              void navigate({ to: "/models" })
            }}
          >
            Set up a provider
          </Button>
        </div>
      </div>
    </div>
  )
}
