import { useEffect, useId, useState } from "react"
import { Button } from "../../components/ui/Button"
import { confirmAction } from "../../components/ui/ConfirmDialog"
import { useModels } from "../../context/ModelsContext"
import { request } from "../../lib/http"
import { card, input } from "../../lib/ui"
import type { CloudProvider } from "./types"

/** Every provider as one row of a divided list; a row opens to its key, model and URL. */
export function ProviderList() {
  const { active } = useModels()
  const [providers, setProviders] = useState<CloudProvider[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    request<{ providers: CloudProvider[] }>("/api/cloud")
      // Set-up providers first, once on load; later changes don't reshuffle the rows under the pointer.
      .then((r) => setProviders([...r.providers].sort((a, b) => rank(a) - rank(b))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load providers"))
  }, [])

  return (
    <div data-tour="providers" className={`${card} divide-y divide-line`}>
      {active?.managed && (
        <p className="px-4 py-3 text-sm text-ink-muted">
          This server sets the provider with <code className="font-mono">CLOUD_PROVIDER</code>. Change it in the
          deployment's environment, not here.
        </p>
      )}
      {error && <p className="px-4 py-3 text-base text-critical-text">Couldn't load providers: {error}</p>}
      {!providers && !error && <p className="px-4 py-3 text-base text-ink-faint">Loading providers…</p>}
      {providers?.map((p) => (
        <ProviderRow
          key={p.id}
          provider={p}
          open={open === p.id}
          onToggle={() => setOpen(open === p.id ? null : p.id)}
          onChange={(next) => setProviders((cur) => cur?.map((c) => next.find((n) => n.id === c.id) ?? c) ?? next)}
        />
      ))}
    </div>
  )
}

const rank = (p: CloudProvider) => (p.managed ? 0 : p.ready ? 1 : p.has_key ? 2 : 3)

/** A pill only where it says something: an untouched provider gets none, so eight rows don't shout "not set up". */
function status(p: CloudProvider, inUse: boolean): { text: string; tone: string } | null {
  if (p.managed) return { text: "Set by server", tone: "bg-surface-3 text-ink-muted" }
  if (inUse) return { text: "In use", tone: "bg-accent-bg text-accent-text" }
  if (p.ready) return { text: "Ready", tone: "bg-good-bg text-good-text" }
  if (p.has_key) return { text: "Needs a model", tone: "bg-warning-bg text-warning-text" }
  return null
}

function ProviderRow({
  provider: p,
  open,
  onToggle,
  onChange,
}: {
  provider: CloudProvider
  open: boolean
  onToggle: () => void
  onChange: (providers: CloudProvider[]) => void
}) {
  const { active, selectProvider, refresh } = useModels()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const inUse = active?.provider === p.id
  const lockedOut = Boolean(active?.managed) && !inUse
  const s = status(p, inUse)
  const formId = useId()

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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={formId}
          className="flex min-w-0 grow items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold text-ink">{p.label}</span>
            {p.model ? (
              <span className="block truncate font-mono text-sm text-ink-muted">{p.model}</span>
            ) : (
              <span className="block text-sm text-ink-faint">{p.has_key ? "Key saved, no model chosen" : "No key"}</span>
            )}
          </span>
        </button>
        {s && <span className={`rounded-full px-2 py-0.5 text-sm font-medium whitespace-nowrap ${s.tone}`}>{s.text}</span>}
        {p.ready && !inUse && !lockedOut && (
          <Button size="sm" disabled={busy} onClick={() => void run(async () => selectProvider(p.id))}>
            Use
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={formId} onClick={onToggle}>
          {open ? "Close" : p.has_key || p.managed ? "Edit" : "Set up"}
        </Button>
      </div>
      {note && !open && (
        <p role="status" className={`px-4 pb-3 text-sm ${note.ok ? "text-good-text" : "text-critical-text"}`}>
          {note.text}
        </p>
      )}
      {open && (
        <ProviderForm
          id={formId}
          provider={p}
          inUse={inUse}
          busy={busy}
          note={note}
          setNote={setNote}
          run={run}
          onSaved={async (providers) => {
            onChange(providers)
            if (inUse) await refresh()
          }}
        />
      )}
    </div>
  )
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
          inUse ? " The Advisor is using it now, so insights and chat stop until you choose another provider." : ""
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

  if (p.managed) {
    return (
      <div id={id} className="animate-page-in bg-surface-2 px-4 py-4 text-sm text-ink-muted">
        Key, model and URL come from the server's <code className="font-mono">CLOUD_API_KEY</code>,{" "}
        <code className="font-mono">CLOUD_MODEL</code> and <code className="font-mono">CLOUD_BASE_URL</code>.
        {p.has_key && <> The key ends in <span className="font-mono">{p.key_hint}</span>.</>}
      </div>
    )
  }

  return (
    <form
      id={id}
      className="animate-page-in grid gap-4 bg-surface-2 px-4 py-4 @3xl:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty && !busy) void save()
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted @3xl:col-span-2">
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
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
        Base URL
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          spellCheck={false}
          placeholder="https://…/v1"
          className={`${input} font-mono text-sm`}
        />
      </label>

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
