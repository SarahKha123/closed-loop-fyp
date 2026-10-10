import { useEffect, useState } from "react"
import { Button } from "../../components/ui/Button"
import { useModels } from "../../context/ModelsContext"
import { request } from "../../lib/http"
import { card, input } from "../../lib/ui"
import type { CloudProvider } from "./types"

/** Cloud APIs tab: one card per provider to save a key and model, test it, and use it. */
export function CloudTab() {
  const [providers, setProviders] = useState<CloudProvider[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    request<{ providers: CloudProvider[] }>("/api/cloud")
      .then((r) => setProviders(r.providers))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load providers"))
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px] text-ink-faint">
        Keys are stored on this machine in <code className="font-mono">config/cloud.json</code> (gitignored) and are
        never sent back to the browser. Cloud models send the Advisor's prompt, including the current readings, to
        the provider.
      </div>
      {error && <div className="text-[12.5px] text-critical-text">{error}</div>}
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
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
  const { active, setCloud, refresh } = useModels()
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
        <div className="text-[14px] font-semibold">{p.label}</div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
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

      <label className="flex flex-col gap-1 text-[12px] text-ink-faint">
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
      <label className="flex flex-col gap-1 text-[12px] text-ink-faint">
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
      <label className="flex flex-col gap-1 text-[12px] text-ink-faint">
        Base URL
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://…/v1"
          className={`${input} font-mono text-[12px]`}
        />
      </label>

      {note && <div className={`text-[12px] ${note.ok ? "text-good-text" : "text-critical-text"}`}>{note.text}</div>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="primary" disabled={busy || !dirty} onClick={() => void save()}>
          Save
        </Button>
        <Button disabled={busy || !p.has_key || dirty} onClick={() => void test()}>
          Test
        </Button>
        <Button
          disabled={busy || !p.ready || dirty || inUse}
          onClick={() => void run(() => setCloud(p.id))}
        >
          {inUse ? "Using" : "Use this"}
        </Button>
        {(p.has_key || p.model) && (
          <Button disabled={busy} onClick={() => void clear()}>
            Remove
          </Button>
        )}
        <div className="grow" />
        {p.docs && (
          <a href={p.docs} target="_blank" rel="noreferrer" className="text-[12px]">
            Get a key ↗
          </a>
        )}
      </div>
    </div>
  )
}
