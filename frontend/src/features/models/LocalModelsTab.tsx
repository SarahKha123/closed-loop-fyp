import { useCallback, useEffect, useRef, useState } from "react"
import { useModels } from "../../context/ModelsContext"
import { formatSize } from "../../lib/format"
import { request, streamEvents } from "../../lib/http"
import type { EventStream } from "../../lib/http"
import { btn, btnPrimary, card, input } from "../../lib/ui"
import type { CatalogueModel, OllamaModel, PullEvent } from "./types"

/**
 * The Installed and Download tabs. One component for both so a download in
 * progress (and its progress bar) survives switching between them.
 */
export function LocalModelsTab({ view, onDownloadTab }: { view: "installed" | "download"; onDownloadTab: () => void }) {
  const { models, modelsError, active, setModel, refresh } = useModels()
  // Only chat models belong here; embedding models can't answer the Advisor.
  const chatModels = models.filter((m) => !m.embedding)
  const hiddenCount = models.length - chatModels.length
  const [catalogue, setCatalogue] = useState<CatalogueModel[]>([])
  const [customTag, setCustomTag] = useState("")
  const [pull, setPull] = useState<{ tag: string; status: string; percent: number | null; error?: string } | null>(
    null,
  )
  const streamRef = useRef<EventStream | null>(null)

  const loadCatalogue = useCallback(async () => {
    try {
      const res = await request<{ models: CatalogueModel[] }>("/api/models/catalogue")
      setCatalogue(res.models)
    } catch {
      /* the installed list's error already says why */
    }
  }, [])

  useEffect(() => {
    void loadCatalogue()
  }, [loadCatalogue])

  // ponytail: one download at a time, and it stops if you leave the Models page (or open Cloud/Hardware); a background queue if that ever matters.
  useEffect(() => () => streamRef.current?.cancel(), [])

  function startPull(tag: string) {
    const clean = tag.trim()
    if (!clean || pull?.status) return
    setPull({ tag: clean, status: "starting", percent: null })
    const stream = streamEvents<PullEvent>("/api/models/pull", { tag: clean }, (ev) => {
      if ("error" in ev) setPull({ tag: clean, status: "", percent: null, error: ev.error })
      else setPull({ tag: clean, status: ev.done ? "" : ev.status, percent: ev.percent })
    })
    streamRef.current = stream
    stream.done
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") setPull(null)
        else setPull({ tag: clean, status: "", percent: null, error: err instanceof Error ? err.message : "failed" })
      })
      .finally(() => {
        streamRef.current = null
        setPull((p) => (p && !p.error ? null : p && { ...p, status: "" }))
        void refresh()
        void loadCatalogue()
      })
  }

  async function remove(tag: string) {
    if (!window.confirm(`Delete ${tag} from this machine? You can download it again later.`)) return
    try {
      await request("/api/models/delete", { method: "POST", body: JSON.stringify({ tag }) })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "delete failed")
    }
    void refresh()
    void loadCatalogue()
  }

  const pulling = Boolean(pull?.status)

  return (
    <div className="flex flex-col gap-4">
      {view === "installed" && (
        <section className="flex min-w-0 flex-col gap-3">
          {chatModels.length === 0 ? (
            <div className={`${card} flex items-center justify-between border-dashed p-6 text-[17px] text-ink-faint`}>
              {modelsError ?? "No chat models downloaded yet."}
              {!modelsError && (
                <button type="button" className={btnPrimary} onClick={onDownloadTab}>
                  Browse models
                </button>
              )}
            </div>
          ) : (
            <div className={`${card} divide-y divide-ink/10`}>
              {chatModels.map((m) => (
                <InstalledRow
                  key={m.name}
                  model={m}
                  inUse={active?.mode !== "cloud" && active?.tag === m.name}
                  pinned={active?.mode === "pinned" && active.tag === m.name}
                  onUse={() => void setModel(m.name)}
                  onDelete={() => void remove(m.name)}
                />
              ))}
            </div>
          )}
          {hiddenCount > 0 && (
            <div className="text-[14.5px] text-ink-faint">
              {hiddenCount} embedding model{hiddenCount > 1 ? "s" : ""} hidden — they can't chat.
            </div>
          )}
        </section>
      )}

      {pull && (
        <div className={`${card} flex flex-col gap-2 p-4`}>
          <div className="flex items-center justify-between text-[16.5px]">
            <span className="font-mono font-medium">{pull.tag}</span>
            {pulling && (
              <button type="button" className={btn} onClick={() => streamRef.current?.cancel()}>
                Cancel
              </button>
            )}
            {pull.error && (
              <button type="button" className={btn} onClick={() => setPull(null)}>
                Dismiss
              </button>
            )}
          </div>
          {pull.error ? (
            <div className="text-[16px] text-critical-text">{pull.error}</div>
          ) : (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${pull.percent ?? 0}%` }}
                />
              </div>
              <div className="text-[15px] text-ink-faint">
                {pull.status}
                {pull.percent != null && ` · ${pull.percent}%`}
              </div>
            </>
          )}
        </div>
      )}

      {view === "download" && (
        <section className="flex min-w-0 flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              startPull(customTag)
              setCustomTag("")
            }}
          >
            <input
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="Any Ollama tag, e.g. llama3.2:3b or hf.co/user/repo:Q4_K_M"
              aria-label="Model tag to download"
              className={`${input} grow font-mono`}
            />
            <button type="submit" className={btnPrimary} disabled={!customTag.trim() || pulling}>
              Download
            </button>
          </form>
          <div className="grid grid-cols-2 gap-3">
            {catalogue.map((m) => (
              <div key={m.tag} className={`${card} flex flex-col gap-1.5 p-3.5`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[17.5px] font-semibold">{m.label}</div>
                    <div className="font-mono text-[14.5px] text-ink-faint">{m.tag}</div>
                  </div>
                  {m.fits != null && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[13.5px] font-semibold ${
                        m.fits ? "bg-good-bg text-good-text" : "bg-warning-bg text-warning-text"
                      }`}
                    >
                      {m.fits ? "Fits" : "Tight on RAM"}
                    </span>
                  )}
                </div>
                <div className="text-[15px] text-ink-muted">{m.note}</div>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="text-[15px] text-ink-faint">
                    {m.vendor} · ≈{formatSize(m.est_size_bytes)}
                  </span>
                  {m.installed ? (
                    <span className="text-[15px] font-medium text-good-text">Installed</span>
                  ) : (
                    <button type="button" className={btn} disabled={pulling} onClick={() => startPull(m.tag)}>
                      {pull?.tag === m.tag && pulling ? "Downloading…" : "Download"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function InstalledRow(props: {
  model: OllamaModel
  inUse: boolean
  pinned: boolean
  onUse: () => void
  onDelete: () => void
}) {
  const { model: m, inUse, pinned } = props
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 grow">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[17px] font-medium">{m.name}</span>
          {inUse && (
            <span className="rounded-full bg-accent-bg px-2 py-0.5 text-[13px] font-semibold text-accent-text">
              in use
            </span>
          )}
        </div>
        <div className="text-[15px] text-ink-faint">
          {[m.parameter_size, m.quantization_level, formatSize(m.size_bytes)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <button type="button" className={btn} disabled={pinned} onClick={props.onUse}>
        {pinned ? "Pinned" : "Use"}
      </button>
      <button type="button" className={`${btn} hover:!border-critical hover:text-critical-text`} onClick={props.onDelete}>
        Delete
      </button>
    </div>
  )
}
