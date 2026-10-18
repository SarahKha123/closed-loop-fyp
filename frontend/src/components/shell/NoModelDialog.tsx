// First-run prompt when nothing can answer the Advisor: no local chat model, or Ollama not installed or not
// running. Offers the two ways forward — run a model on this computer (installing and starting Ollama here if
// needed, then picking a model to download) or use a cloud model.
// Shown until dismissed for the browser session; never in cloud mode or study mode. On the Models page it only
// appears while Ollama is down — with Ollama up, that page already is the "pick a model" step.

import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useModels } from "../../context/ModelsContext"
import type { PullEvent } from "../../features/models/types"
import { request, streamEvents } from "../../lib/http"
import type { EventStream } from "../../lib/http"
import { Button } from "../ui/Button"
import { Icon } from "../ui/Icon"

const DISMISSED_KEY = "closed-loop:no-model-dismissed"

/** GET /api/models/runtime */
interface Runtime {
  installed: boolean
  running: boolean
  binary: string | null
  can_install: boolean
}

function wasDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

export function NoModelDialog({ studyMode }: { studyMode: boolean }) {
  const { models, modelsLoading, active } = useModels()
  const onModelsPage = useRouterState({ select: (s) => s.location.pathname.startsWith("/models") })
  const [dismissed, setDismissed] = useState(wasDismissed)

  // `active` is null when the backend itself is unreachable — that's a different problem, not this one.
  const noChatModel = !models.some((m) => !m.embedding)
  const ollamaDown = active?.ollama_error != null
  if (dismissed || modelsLoading || studyMode || !active || active.mode === "cloud" || !noChatModel) return null
  if (onModelsPage && !ollamaDown) return null

  const close = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // Storage blocked: the dialog just comes back on the next reload.
    }
    setDismissed(true)
  }
  return <Dialog onClose={close} />
}

function Dialog({ onClose }: { onClose: () => void }) {
  const { refresh } = useModels()
  const navigate = useNavigate()
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [busy, setBusy] = useState<{ status: string; percent: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<EventStream | null>(null)

  useEffect(() => {
    request<Runtime>("/api/models/runtime")
      .then(setRuntime)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not reach the backend"))
    return () => streamRef.current?.cancel()
  }, [])

  const go = (tab: "download" | "cloud") => {
    onClose()
    void navigate({ to: "/models", search: { tab } })
  }

  // Ollama is up: refresh what the sidebar and Models page know, then pick a model to download.
  const ready = async () => {
    await refresh()
    go("download")
  }

  const startOllama = async () => {
    setError(null)
    setBusy({ status: "Starting Ollama…", percent: null })
    try {
      // ollama serve can take ~20 s to answer on first start.
      await request("/api/models/runtime/start", { method: "POST", timeoutMs: 30_000 })
      await ready()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ollama didn't start")
      setBusy(null)
    }
  }

  const installOllama = () => {
    setError(null)
    setBusy({ status: "Connecting to ollama.com…", percent: 0 })
    let failed = false
    const stream = streamEvents<PullEvent>("/api/models/runtime/install", {}, (ev) => {
      if ("error" in ev) {
        failed = true
        setError(ev.error)
      } else setBusy({ status: ev.status, percent: ev.percent })
    })
    streamRef.current = stream
    stream.done
      .then(() => (failed ? setBusy(null) : ready()))
      .catch((err: unknown) => {
        setBusy(null)
        if (!(err instanceof Error && err.name === "AbortError")) setError(err instanceof Error ? err.message : "install failed")
      })
      .finally(() => {
        streamRef.current = null
      })
  }

  const runLocal = (action: string | null | undefined) => {
    if (action === "Install Ollama") installOllama()
    else if (action === "Start Ollama") void startOllama()
    else void ready()
  }

  let local: { detail: ReactNode; action: "Choose a model" | "Start Ollama" | "Install Ollama" | null } | null = null
  if (runtime?.running) {
    local = { detail: "Ollama is running. Pick a model that fits this machine and download it.", action: "Choose a model" }
  } else if (runtime?.installed) {
    local = { detail: "Ollama is installed but not running. Start it, then pick a model to download.", action: "Start Ollama" }
  } else if (runtime?.can_install) {
    local = {
      detail: "Installs Ollama into this project (≈1.4 GB download, no admin password), then you pick a model to download.",
      action: "Install Ollama",
    }
  } else if (runtime) {
    local = {
      detail: (
        <>
          Install Ollama from{" "}
          <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-accent-text underline">
            ollama.com
          </a>
          , start it, then reload this page.
        </>
      ),
      action: null,
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-model-title"
        className="w-full max-w-[460px] rounded-xl border border-line bg-surface p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 grow">
            <h2 id="no-model-title" className="text-lg font-semibold text-ink">
              Choose how the Advisor runs
            </h2>
            <p className="mt-1 text-base text-ink-muted">
              The Advisor's chat and insights need a language model, and none is set up yet.
            </p>
          </div>
          {!busy && (
            <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Choice icon="models" title="Run a model on this computer" detail={local?.detail ?? "Checking for Ollama…"}>
            {busy ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-track">
                  <div
                    className={`h-full rounded-full bg-accent transition-[width] ${busy.percent == null ? "w-1/3 animate-pulse" : ""}`}
                    style={busy.percent == null ? undefined : { width: `${busy.percent}%` }}
                  />
                </div>
                <div className="mt-1.5 text-sm text-ink-faint">{busy.status}</div>
              </div>
            ) : (
              local?.action && (
                <Button variant="primary" className="mt-3" onClick={() => runLocal(local?.action)}>
                  {local.action}
                </Button>
              )
            )}
          </Choice>

          <Choice icon="external" title="Use a cloud model" detail="Add an API key for a hosted model. Nothing to download; needs an internet connection.">
            <Button className="mt-3" disabled={Boolean(busy)} onClick={() => go("cloud")}>
              Set up a cloud API
            </Button>
          </Choice>
        </div>

        {error && <div className="mt-3 rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical-text">{error}</div>}

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" disabled={Boolean(busy)} onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  )
}

function Choice({ icon, title, detail, children }: { icon: "models" | "external"; title: string; detail: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-line p-3.5">
      <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-accent-text" />
      <div className="min-w-0 grow">
        <div className="text-base font-semibold text-ink">{title}</div>
        <div className="mt-0.5 text-base text-ink-muted">{detail}</div>
        {children}
      </div>
    </div>
  )
}
