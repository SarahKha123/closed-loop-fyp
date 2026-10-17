// First-run prompt: nothing can answer the Advisor because no local chat model is installed (or Ollama
// isn't running). Points to the Models page to download one or set up a cloud API instead.
// Shown once per browser session; never in cloud mode, on the Models page itself, or in study mode.

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
  const { models, modelsLoading, active } = useModels()
  const navigate = useNavigate()
  const onModelsPage = useRouterState({ select: (s) => s.location.pathname.startsWith("/models") })
  const [dismissed, setDismissed] = useState(wasDismissed)

  // `active` is null when the backend itself is unreachable — that's a different problem, not this one.
  const noChatModel = !models.some((m) => !m.embedding)
  if (dismissed || modelsLoading || studyMode || onModelsPage || !active || active.mode === "cloud" || !noChatModel) {
    return null
  }
  const ollamaDown = active.ollama_error !== null

  const close = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // Storage blocked: the dialog just comes back on the next reload.
    }
    setDismissed(true)
  }
  const go = (tab: "download" | "cloud") => {
    close()
    void navigate({ to: "/models", search: { tab } })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-model-title"
        className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Icon name="models" size={18} className="mt-0.5 shrink-0 text-accent-text" />
          <div className="min-w-0 grow">
            <h2 id="no-model-title" className="text-[15px] font-semibold text-ink">
              {ollamaDown ? "Ollama isn't running" : "Download a language model"}
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              {ollamaDown ? (
                <>
                  The Advisor's chat and insights need Ollama to run a model on this machine. Install it with{" "}
                  <code className="font-mono text-[12px]">./closed-loop.sh setup</code>, then restart the app — or use a
                  cloud API instead.
                </>
              ) : (
                "No language model is installed yet, so the Advisor's chat and insights can't answer. Download one from the Models page — it lists which fit this machine."
              )}
            </p>
          </div>
          <button type="button" onClick={close} className="text-ink-faint hover:text-ink" aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Not now
          </Button>
          <Button variant={ollamaDown ? "primary" : "secondary"} onClick={() => go("cloud")}>
            Use a cloud API
          </Button>
          {!ollamaDown && (
            <Button variant="primary" onClick={() => go("download")}>
              Download a model
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
