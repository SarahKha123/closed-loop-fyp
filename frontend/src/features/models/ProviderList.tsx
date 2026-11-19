import { useEffect, useId, useState } from "react"
import { Button } from "../../components/ui/Button"
import { confirmAction } from "../../components/ui/ConfirmDialog"
import { useModels } from "../../context/ModelsContext"
import { request } from "../../lib/http"
import { card, input, inputCompact } from "../../lib/ui"
import type { CloudProvider } from "./types"

/** One provider at a time: a dropdown picks it (its saved base URL comes with it), and one form below edits it. */
export function ProviderList() {
  const { active, selectProvider, refresh } = useModels()
  const [providers, setProviders] = useState<CloudProvider[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const selectId = useId()

  useEffect(() => {
    request<{ providers: CloudProvider[] }>("/api/cloud")
      .then((r) => setProviders(r.providers))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load providers"))
  }, [])

  // Opens on the provider in use, else the first one that's ready, else the first in the list.
  const p = providers?.find((c) => c.id === picked) ?? providers?.find((c) => c.id === active?.provider) ?? providers?.find((c) => c.ready) ?? providers?.[0]
  const inUse = Boolean(p && active?.provider === p.id)
  const s = p ? status(p, inUse) : null

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

  if (error) return <p className={`${card} px-4 py-3 text-base text-critical-text`}>Couldn't load providers: {error}</p>
  if (!providers || !p) return <p className={`${card} px-4 py-3 text-base text-ink-faint`}>Loading providers…</p>

  return (
    <div data-tour="providers" className={card}>
      <div className="flex flex-wrap items-end gap-3 px-4 py-4">
        <label htmlFor={selectId} className="flex min-w-[16rem] grow flex-col gap-1.5 text-sm font-medium text-ink-muted @3xl:grow-0">
          Provider
          <select
            id={selectId}
            value={p.id}
            onChange={(e) => {
              setPicked(e.target.value)
              setNote(null)
            }}
            className={`${inputCompact} pr-8`}
          >
            {providers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.id === active?.provider ? " · in use" : c.ready ? " · ready" : c.has_key ? " · key saved" : ""}
              </option>
            ))}
          </select>
        </label>
        {s && <span className={`mb-2 rounded-full px-2 py-0.5 text-sm font-medium whitespace-nowrap ${s.tone}`}>{s.text}</span>}
        <div className="grow" />
        {p.ready && !inUse && (
          <Button variant="primary" disabled={busy} onClick={() => void run(async () => selectProvider(p.id))}>
            Use for my chat
          </Button>
        )}
      </div>
      <ProviderForm
        key={p.id}
        id={`${selectId}-form`}
        provider={p}
        inUse={inUse}
        busy={busy}
        note={note}
        setNote={setNote}
        run={run}
        onSaved={async (next) => {
          setProviders(next)
          if (inUse) await refresh()
        }}
      />
    </div>
  )
}

/** A pill only where it says something: an untouched provider gets none. */
function status(p: CloudProvider, inUse: boolean): { text: string; tone: string } | null {
  if (inUse) return { text: "In use", tone: "bg-accent-bg text-accent-text" }
  if (p.ready) return { text: "Ready", tone: "bg-good-bg text-good-text" }
  if (p.has_key) return { text: "Needs a model", tone: "bg-warning-bg text-warning-text" }
  return null
}

function ProviderForm({
  id,
  provider: p,
  inUse,
  busy,
  note,
  setNote,
  run,
  onSaved,
}: {
  id: string
  provider: CloudProvider
  inUse: boolean
  busy: boolean
  note: { ok: boolean; text: string } | null
  setNote: (n: { ok: boolean; text: string } | null) => void
  run: (action: () => Promise<void>) => Promise<void>
  onSaved: (providers: CloudProvider[]) => Promise<void>
}) {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState(p.model)
  const [baseUrl, setBaseUrl] = useState(p.base_url)
  const [offered, setOffered] = useState<string[]>([])
  const dirty = Boolean(key) || model !== p.model || baseUrl !== p.base_url
  const noteId = `${id}-note`
  const listId = `${id}-models`

  const save = () =>
    run(async () => {
      const body: Record<string, string> = { model, base_url: baseUrl }
      if (key) body.api_key = key
      const r = await request<{ providers: CloudProvider[] }>(`/api/cloud/${p.id}`, { method: "PUT", body: JSON.stringify(body) })
      setKey("")
      setNote({ ok: true, text: "Saved." })
      await onSaved(r.providers)
    })

  const test = () =>
    run(async () => {
      const r = await request<{ ok: boolean; detail: string; models: string[] }>(`/api/cloud/${p.id}/test`, { method: "POST" })
      setNote({ ok: r.ok, text: r.ok ? `Connected. ${r.models.length} models offered — pick one under Model.` : r.detail })
      setOffered(r.models)
    })

  const remove = () =>
    run(async () => {
      const ok = await confirmAction({
        title: `Remove the ${p.label} key?`,
        body: `The saved API key and model for ${p.label} are deleted. You will need to paste the key again to use it.${
          inUse ? " Your Advisor chat uses it now, so it stops until you choose another provider." : ""
        }`,
        confirmLabel: "Remove key",
      })
      if (!ok) return
      const r = await request<{ providers: CloudProvider[] }>(`/api/cloud/${p.id}`, { method: "DELETE" })
      setModel("")
      setBaseUrl(p.default_base_url)
      setNote(null)
      await onSaved(r.providers)
    })

  return (
    <form
      id={id}
      className="grid gap-4 border-t border-line px-4 py-4 @3xl:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty && !busy) void save()
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
        API key
        <span className="flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={p.has_key ? `Saved (${p.key_hint}). Paste to replace.` : "Paste your key"}
            aria-describedby={note ? noteId : undefined}
            className={`${input} grow font-mono text-sm placeholder:font-sans`}
          />
          <Button variant="ghost" disabled={!key} onClick={() => setShowKey(!showKey)} aria-pressed={showKey}>
            {showKey ? "Hide" : "Show"}
          </Button>
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
        Model
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          list={listId}
          spellCheck={false}
          placeholder={offered.length ? "Pick from the list" : "Save a key, then Test to list models"}
          className={`${input} font-mono text-sm placeholder:font-sans`}
        />
        <datalist id={listId}>
          {offered.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      {/* The base URL comes with the provider; only Custom needs one typed, so it's tucked away for the rest. */}
      <details open={!p.default_base_url || baseUrl !== p.default_base_url} className="text-sm @3xl:col-span-2">
        <summary className="w-fit cursor-pointer text-ink-muted hover:text-ink">
          Base URL <span className="ml-1 font-mono text-ink-faint">{baseUrl || "not set"}</span>
        </summary>
        <label className="mt-2 flex flex-col gap-1.5 font-medium text-ink-muted">
          <span className="sr-only">Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            spellCheck={false}
            placeholder="https://…/v1"
            className={`${input} font-mono text-sm`}
          />
        </label>
      </details>

      {note && (
        <p id={noteId} role="status" className={`text-sm @3xl:col-span-2 ${note.ok ? "text-good-text" : "text-critical-text"}`}>
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 @3xl:col-span-2">
        <Button type="submit" variant="primary" disabled={busy || !dirty}>
          Save
        </Button>
        <Button disabled={busy || !p.has_key || dirty} title={dirty ? "Save first" : undefined} onClick={() => void test()}>
          Test connection
        </Button>
        {(p.has_key || p.model) && (
          <Button variant="danger" disabled={busy} onClick={() => void remove()}>
            Remove key
          </Button>
        )}
        <div className="grow" />
        {p.docs && (
          <a href={p.docs} target="_blank" rel="noreferrer" className="text-sm">
            Get an API key ↗
          </a>
        )}
      </div>
    </form>
  )
}
