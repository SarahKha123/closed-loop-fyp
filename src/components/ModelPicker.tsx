import { useEffect, useRef, useState } from "react"
import { useSettings } from "../context/SettingsContext"

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

export function ModelPicker() {
  const { models, modelsLoading, modelsError, active, setModel, setAuto } = useSettings()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  const activeTag = active?.tag ?? null

  let label = "Loading models…"
  if (!modelsLoading) {
    if (modelsError && models.length === 0) label = "Ollama unreachable"
    else if (activeTag) label = activeTag
    else if (models.length === 0) label = "No local models"
    else label = "Choose a model"
  }

  async function pick(action: () => Promise<void>) {
    setPending(true)
    try {
      await action()
    } finally {
      setPending(false)
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[16px] font-semibold tracking-wide text-ink-faint uppercase">Model</div>
        {active && (
          <span className="text-[13px] tracking-wide text-ink-faint uppercase">{active.mode}</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={modelsLoading}
        className="flex w-full items-center justify-between rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-left text-[17.5px] font-medium text-[#3F3E3A] transition-colors disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`h-[7px] w-[7px] shrink-0 rounded-full ${
              modelsLoading ? "bg-ink-faint" : active?.resolved ? "bg-good" : "bg-critical"
            }`}
          />
          <span className="truncate">{label}</span>
        </span>
        <span className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {!modelsLoading && active && !active.resolved && (
        <div className="mt-1.5 text-[15px] text-ink-faint">{active.reason}</div>
      )}

      {open && (
        <div className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-ink/15 bg-white shadow-lg">
          <button
            type="button"
            disabled={pending}
            onClick={() => pick(setAuto)}
            className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors ${
              active?.mode === "auto" ? "bg-accent-bg text-accent-text" : "text-[#3F3E3A] hover:bg-track"
            }`}
          >
            <span className="text-[17.5px] font-medium">Auto</span>
            <span className="text-[15px] text-ink-faint">Best installed model for this machine's RAM</span>
          </button>

          {models.length === 0 ? (
            <div className="px-3 py-2.5 text-[15px] text-ink-faint">
              {modelsError ?? "No local models — install one with `ollama pull llama3.2`"}
            </div>
          ) : (
            models.map((m) => {
              const size = formatSize(m.size_bytes)
              const selected = active?.mode === "pinned" && active.tag === m.name
              return (
                <button
                  key={m.name}
                  type="button"
                  disabled={pending}
                  onClick={() => pick(() => setModel(m.name))}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors ${
                    selected ? "bg-accent-bg text-accent-text" : "text-[#3F3E3A] hover:bg-track"
                  }`}
                >
                  <span className="text-[17.5px] font-medium">{m.name}</span>
                  <span className="text-[15px] text-ink-faint">
                    {[m.parameter_size, m.quantization_level, size].filter(Boolean).join(" · ") || "installed"}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
