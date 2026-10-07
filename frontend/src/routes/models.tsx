import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { useSettings } from "../context/SettingsContext"
import type { OllamaModel } from "../context/SettingsContext"
import { request, streamEvents } from "../lib/http"
import type { EventStream } from "../lib/http"

type Tab = "local" | "cloud"

export const Route = createFileRoute("/models")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: search.tab === "cloud" ? "cloud" : undefined,
  }),
  component: ModelsView,
})

interface CatalogueModel {
  tag: string
  label: string
  vendor: string
  params_b: number
  est_size_bytes: number
  note: string
  installed: boolean
  fits: boolean | null
}

interface Hardware {
  cpu: { cores_logical: number | null }
  ram: { total_bytes: number | null; available_bytes: number | null }
  gpu: { name: string; vram_bytes: number | null } | null
}

interface CloudProvider {
  id: string
  label: string
  docs: string
  default_base_url: string
  base_url: string
  model: string
  has_key: boolean
  key_hint: string | null
  ready: boolean
}

type PullEvent = { status: string; percent: number | null; done: boolean } | { error: string }

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "—"
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

const card = "rounded-xl border border-ink/10 bg-surface"
const btn =
  "rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-[16px] font-medium text-[#3F3E3A] transition-colors hover:border-accent-border disabled:opacity-40"
const btnPrimary = "rounded-lg bg-accent px-3 py-1.5 text-[16px] font-semibold text-white disabled:opacity-40"
const input = "min-w-0 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[16.5px]"

function ModelsView() {
  const { tab = "local" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { active, setAuto } = useSettings()

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title="Models"
        subtitle="Choose what answers in the Advisor: a local model through Ollama, or a cloud API"
      />

      <ActiveStrip />

      <div className="flex items-center gap-1 border-b border-ink/10">
        {(["local", "cloud"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => navigate({ search: { tab: t === "local" ? undefined : t } })}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[18px] font-medium transition-colors ${
              tab === t ? "border-accent text-accent-text" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t === "local" ? "Local (Ollama)" : "Cloud APIs"}
          </button>
        ))}
        <div className="grow" />
        {active?.mode !== "auto" && (
          <button type="button" className={btn} onClick={() => void setAuto()}>
            Switch to Auto
          </button>
        )}
      </div>

      {tab === "local" ? <LocalTab /> : <CloudTab />}
    </div>
  )
}

function ActiveStrip() {
  const { active, modelsLoading } = useSettings()
  const modeText =
    active?.mode === "cloud"
      ? `Cloud · ${active.provider}`
      : active?.mode === "pinned"
        ? "Local · pinned"
        : "Local · auto (largest installed model that fits in RAM)"

  return (
    <div className={`${card} flex items-center gap-4 p-4`}>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          modelsLoading ? "bg-ink-faint" : active?.resolved ? "bg-good" : "bg-critical"
        }`}
      />
      <div className="min-w-0">
        <div className="text-[15px] tracking-wide text-ink-faint uppercase">Advisor is using</div>
        <div className="truncate font-mono text-[20px] font-semibold">{active?.tag ?? "nothing yet"}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[16.5px] font-medium text-ink-muted">{modeText}</div>
        {active && <div className="text-[15px] text-ink-faint">{active.reason}</div>}
      </div>
    </div>
  )
}

// ── local ────────────────────────────────────────────────────────────────────

function LocalTab() {
  const { models, modelsError, active, setModel, refresh } = useSettings()
  const [catalogue, setCatalogue] = useState<CatalogueModel[]>([])
  const [hardware, setHardware] = useState<Hardware | null>(null)
  const [customTag, setCustomTag] = useState("")
  const [pull, setPull] = useState<{ tag: string; status: string; percent: number | null; error?: string } | null>(
    null,
  )
  const streamRef = useRef<EventStream | null>(null)

  const loadCatalogue = useCallback(async () => {
    try {
      const res = await request<{ models: CatalogueModel[]; hardware: Hardware }>("/api/models/catalogue")
      setCatalogue(res.models)
      setHardware(res.hardware)
    } catch {
      /* the installed list's error already says why */
    }
  }, [])

  useEffect(() => {
    void loadCatalogue()
  }, [loadCatalogue])

  // ponytail: one download at a time, and it stops if you leave the page; a background queue if that ever matters.
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
    <div className="flex flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Installed</h2>
        {hardware && (
          <div className="text-[16px] text-ink-faint">
            This machine: {formatSize(hardware.ram.total_bytes)} RAM
            {hardware.gpu ? ` · ${hardware.gpu.name} (${formatSize(hardware.gpu.vram_bytes)})` : " · no NVIDIA GPU"}
          </div>
        )}
        {models.length === 0 ? (
          <div className={`${card} border-dashed p-6 text-[17px] text-ink-faint`}>
            {modelsError ?? "Nothing downloaded yet. Pick one on the right."}
          </div>
        ) : (
          <div className={`${card} divide-y divide-ink/10`}>
            {models.map((m) => (
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
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Download</h2>
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
      {m.embedding ? (
        <span className="text-[14.5px] text-ink-faint" title="Embedding models turn text into vectors; they can't answer chat">
          embedding · can't chat
        </span>
      ) : (
        <button type="button" className={btn} disabled={pinned} onClick={props.onUse}>
          {pinned ? "Pinned" : "Use"}
        </button>
      )}
      <button type="button" className={`${btn} hover:!border-critical hover:text-critical-text`} onClick={props.onDelete}>
        Delete
      </button>
    </div>
  )
}

// ── cloud ────────────────────────────────────────────────────────────────────

function CloudTab() {
  const [providers, setProviders] = useState<CloudProvider[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    request<{ providers: CloudProvider[] }>("/api/cloud")
      .then((r) => setProviders(r.providers))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load providers"))
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[16px] text-ink-faint">
        Keys are stored on this machine in <code className="font-mono">config/cloud.json</code> (gitignored) and are
        never sent back to the browser. Cloud models send the Advisor's prompt, including the current readings, to
        the provider.
      </div>
      {error && <div className="text-[16px] text-critical-text">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={setProviders} />
        ))}
      </div>
    </div>
  )
}

function ProviderCard({
  provider: p,
  onChange,
}: {
  provider: CloudProvider
  onChange: (providers: CloudProvider[]) => void
}) {
  const { active, setCloud, refresh } = useSettings()
  const [key, setKey] = useState("")
  const [model, setModelName] = useState(p.model)
  const [baseUrl, setBaseUrl] = useState(p.base_url)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [offered, setOffered] = useState<string[]>([])
  const inUse = active?.mode === "cloud" && active.provider === p.id
  const dirty = Boolean(key) || model !== p.model || baseUrl !== p.base_url

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "failed" })
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const body: Record<string, string> = { model, base_url: baseUrl }
      if (key) body.api_key = key
      const r = await request<{ providers: CloudProvider[] }>(`/api/cloud/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
      setKey("")
      setNote({ ok: true, text: "saved" })
      onChange(r.providers)
      if (inUse) await refresh()
    })

  const test = () =>
    run(async () => {
      const r = await request<{ ok: boolean; detail: string; models: string[] }>(`/api/cloud/${p.id}/test`, {
        method: "POST",
      })
      setNote({ ok: r.ok, text: r.detail })
      setOffered(r.models)
    })

  const clear = () =>
    run(async () => {
      if (!window.confirm(`Remove the saved ${p.label} key and model?`)) return
      const r = await request<{ providers: CloudProvider[] }>(`/api/cloud/${p.id}`, { method: "DELETE" })
      onChange(r.providers)
      setModelName("")
      setBaseUrl(p.default_base_url)
      setNote(null)
      if (inUse) await refresh()
    })

  const listId = `models-${p.id}`

  return (
    <div className={`${card} flex flex-col gap-2.5 p-4 ${inUse ? "!border-accent-border" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-[18px] font-semibold">{p.label}</div>
        <span
          className={`rounded-full px-2 py-0.5 text-[13.5px] font-semibold ${
            inUse
              ? "bg-accent-bg text-accent-text"
              : p.ready
                ? "bg-good-bg text-good-text"
                : p.has_key
                  ? "bg-warning-bg text-warning-text"
                  : "bg-track text-ink-faint"
          }`}
        >
          {inUse ? "in use" : p.ready ? "ready" : p.has_key ? "needs a model" : "not set up"}
        </span>
      </div>

      <label className="flex flex-col gap-1 text-[14.5px] text-ink-faint">
        API key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={p.has_key ? `saved (${p.key_hint}) — paste to replace` : "paste your key"}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-[14.5px] text-ink-faint">
        Model
        <input
          value={model}
          onChange={(e) => setModelName(e.target.value)}
          list={listId}
          placeholder={offered.length ? "pick from the list" : "model id — Test lists what's available"}
          className={`${input} font-mono`}
        />
        <datalist id={listId}>
          {offered.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 text-[14.5px] text-ink-faint">
        Base URL
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://…/v1"
          className={`${input} font-mono text-[15px]`}
        />
      </label>

      {note && <div className={`text-[15px] ${note.ok ? "text-good-text" : "text-critical-text"}`}>{note.text}</div>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className={btnPrimary} disabled={busy || !dirty} onClick={() => void save()}>
          Save
        </button>
        <button type="button" className={btn} disabled={busy || !p.has_key || dirty} onClick={() => void test()}>
          Test
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy || !p.ready || dirty || inUse}
          onClick={() => void run(() => setCloud(p.id))}
        >
          {inUse ? "Using" : "Use this"}
        </button>
        {(p.has_key || p.model) && (
          <button type="button" className={btn} disabled={busy} onClick={() => void clear()}>
            Remove
          </button>
        )}
        <div className="grow" />
        {p.docs && (
          <a href={p.docs} target="_blank" rel="noreferrer" className="text-[15px]">
            Get a key ↗
          </a>
        )}
      </div>
    </div>
  )
}
