// Admin → Email and Admin → Google sign-in: what used to be .env, saved on the server instead (tbl_ServerSetting).
// Each view is a settings row: what it is and how to get the values on the left, the form on the right,
// and what the setting produces under the form. Secrets are write-only: the field shows only the last four
// characters of the saved one, and saving with the field empty keeps it.

import { useEffect, useId, useState } from "react"
import type { ReactNode } from "react"
import { Button } from "../../components/ui/Button"
import { confirmAction } from "../../components/ui/ConfirmDialog"
import { Icon } from "../../components/ui/Icon"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../lib/api"
import type { ServerConfig } from "../../lib/api"
import { card, input } from "../../lib/ui"

type Note = { ok: boolean; text: string }

function useServerConfig() {
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.admin.server().then(setConfig).catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load"))
  }, [])
  return { config, setConfig, error }
}

/** Left: the section's title, what it does and how to set it up. Right: the panel. Stacks below 1024px. */
function SettingsRow({ title, about, steps, children }: { title: string; about: string; steps: ReactNode[]; children: ReactNode }) {
  return (
    <div className="grid items-start gap-x-10 gap-y-4 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-3 @4xl:pt-1">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-base text-ink">{about}</p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-muted marker:text-ink-faint">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
      {label}
      {children}
      {hint && <span className="text-sm font-normal text-ink-faint">{hint}</span>}
    </label>
  )
}

function NoteLine({ note }: { note: Note | null }) {
  if (!note) return null
  return (
    <p role="status" className={`text-sm ${note.ok ? "text-good-text" : "text-critical-text"}`}>
      {note.text}
    </p>
  )
}

const external = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text} ↗
  </a>
)

export function EmailView() {
  const { config, setConfig, error } = useServerConfig()
  const { user, reload } = useAuth()
  const [typed, setSender] = useState<string | null>(null) // null: untouched, show the saved one
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)

  const saved = config?.email
  const sender = typed ?? saved?.sender ?? ""
  const ready = Boolean(saved?.sender && saved.passwordHint)
  const dirty = sender.trim() !== (saved?.sender ?? "") || Boolean(password)

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work" })
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    act(async () => {
      setConfig(await api.admin.saveEmail(sender.trim(), password || undefined))
      setPassword("")
      setSender(null)
      setNote({ ok: true, text: "Saved. Emails go out from this account now." })
      await reload() // the "email set up" flag other pages read
    })

  const test = () =>
    act(async () => {
      const r = await api.admin.testEmail()
      setNote({ ok: true, text: `Sent to ${r.to}. Check the inbox (and spam, the first time).` })
    })

  const remove = () =>
    act(async () => {
      const ok = await confirmAction({
        title: "Remove the Gmail sender?",
        body: "The address and its App Password are deleted. No emails go out (sign-ups, approvals, work orders) until an admin adds a sender again.",
        confirmLabel: "Remove sender",
      })
      if (!ok) return
      setConfig(await api.admin.clearEmail())
      setSender(null)
      setNote(null)
      await reload()
    })

  if (!config) return <p className="text-base text-ink-faint">{error ? `Couldn't load: ${error}` : "Loading…"}</p>

  return (
    <SettingsRow
      title="Gmail sender"
      about="The Gmail account every email comes from: sign-ups to the admins, approvals to the applicant, and new work orders to everyone who asked for them."
      steps={[
        <>Use a personal Gmail. School and work accounts usually can't make App Passwords.</>,
        <>Turn on {external("https://myaccount.google.com/signinoptions/twosv", "2-Step Verification")} for that account.</>,
        <>Create an {external("https://myaccount.google.com/apppasswords", "App Password")} named Closed Loop and paste it here. Spaces are fine.</>,
      ]}
    >
      <form
        className={`${card} flex flex-col gap-4 p-4`}
        onSubmit={(e) => {
          e.preventDefault()
          if (dirty && !busy) void save()
        }}
      >
        <Field label="Gmail address">
          <input type="email" required value={sender} onChange={(e) => setSender(e.target.value)} autoComplete="off" spellCheck={false} placeholder="closedloop.alerts@gmail.com" className={input} />
        </Field>
        <Field label="App Password" hint="16 letters from Google. Stored encrypted; never shown again.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            required={!saved?.passwordHint}
            placeholder={saved?.passwordHint ? `Saved (${saved.passwordHint}). Paste to replace.` : "abcd efgh ijkl mnop"}
            className={input}
          />
        </Field>
        <NoteLine note={note} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={busy || !dirty}>
            Save
          </Button>
          <Button disabled={busy || !ready || dirty || !user?.email} title={!user?.email ? "Add your email in the profile menu first" : undefined} onClick={() => void test()}>
            {busy ? "Working…" : `Send a test to ${user?.email ?? "you"}`}
          </Button>
          <span className="grow" />
          {(saved?.sender || saved?.passwordHint) && (
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              Remove sender
            </Button>
          )}
        </div>
      </form>

      {/* What the setting produces: the approval email as the applicant receives it. */}
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm text-ink-muted">What an approved applicant receives</figcaption>
        <div className="rounded-xl bg-surface-2 p-4 text-base">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-ink-faint">From</dt>
            <dd className="min-w-0 truncate text-ink">Closed Loop &lt;{sender.trim() || "your Gmail"}&gt;</dd>
            <dt className="text-ink-faint">Subject</dt>
            <dd className="text-ink">[Closed Loop] Your account was approved</dd>
          </dl>
          <p className="mt-3 text-ink">Hi Sarah K,</p>
          <p className="mt-2 text-ink">An administrator approved your Closed Loop account. You can sign in now.</p>
        </div>
      </figure>
    </SettingsRow>
  )
}

export function GoogleView() {
  const { config, setConfig, error } = useServerConfig()
  const { reload } = useAuth()
  const [typedId, setClientId] = useState<string | null>(null) // null: untouched, show the saved one
  const [secret, setSecret] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const [copied, setCopied] = useState(false)
  const uriId = useId()

  const saved = config?.google
  const clientId = typedId ?? saved?.clientId ?? ""
  const on = Boolean(saved?.clientId && saved.secretHint)
  const dirty = clientId.trim() !== (saved?.clientId ?? "") || Boolean(secret)

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work" })
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    act(async () => {
      setConfig(await api.admin.saveGoogle(clientId.trim(), secret || undefined))
      setSecret("")
      setClientId(null)
      setNote({ ok: true, text: "Saved. The sign-in page shows Continue with Google now." })
      await reload()
    })

  const remove = () =>
    act(async () => {
      const ok = await confirmAction({
        title: "Turn off Google sign-in?",
        body: "The client ID and secret are deleted and the sign-in page stops offering Google. Accounts made with Google can't sign in until it is set up again.",
        confirmLabel: "Turn off",
      })
      if (!ok) return
      setConfig(await api.admin.clearGoogle())
      setClientId(null)
      setNote(null)
      await reload()
    })

  async function copy() {
    if (!saved) return
    try {
      await navigator.clipboard.writeText(saved.redirectUri)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      ;(document.getElementById(uriId) as HTMLInputElement | null)?.select() // no clipboard access: select it for Ctrl+C
    }
  }

  if (!config || !saved) return <p className="text-base text-ink-faint">{error ? `Couldn't load: ${error}` : "Loading…"}</p>

  return (
    <SettingsRow
      title="Google sign-in"
      about="Lets people sign in with their Google account. New Google accounts wait for approval like any other sign-up."
      steps={[
        <>In the {external("https://console.cloud.google.com/auth/clients", "Google Cloud console")}, create an OAuth client of type Web application.</>,
        <>Add the redirect URI below to it, exactly as shown, and this site's address as a JavaScript origin.</>,
        <>Paste the client ID and secret here. Google can take a few minutes to apply its side.</>,
      ]}
    >
      <form
        className={`${card} flex flex-col gap-4 p-4`}
        onSubmit={(e) => {
          e.preventDefault()
          if (dirty && !busy) void save()
        }}
      >
        <p className="flex items-center gap-2 text-base text-ink">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${on ? "bg-good" : "bg-ink-faint"}`} />
          {on ? "On: the sign-in page offers Continue with Google." : "Off: the sign-in page offers only a username and password."}
        </p>
        <Field label="Redirect URI" hint="Paste this into the client's Authorized redirect URIs.">
          {/* A joined field and action: one border, squared inner corners. */}
          <span className="flex">
            <input id={uriId} readOnly value={saved.redirectUri} onFocus={(e) => e.target.select()} className={`${input} grow rounded-r-none text-sm`} />
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-r-lg border border-l-0 border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
            </button>
          </span>
        </Field>
        <Field label="Client ID">
          <input required value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} placeholder="1234…apps.googleusercontent.com" className={`${input} text-sm`} />
        </Field>
        <Field label="Client secret" hint="Starts with GOCSPX-. Stored encrypted; never shown again.">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            required={!saved.secretHint}
            placeholder={saved.secretHint ? `Saved (${saved.secretHint}). Paste to replace.` : "GOCSPX-…"}
            className={input}
          />
        </Field>
        <NoteLine note={note} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={busy || !dirty}>
            Save
          </Button>
          <span className="grow" />
          {(saved.clientId || saved.secretHint) && (
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              Turn off Google sign-in
            </Button>
          )}
        </div>
      </form>
    </SettingsRow>
  )
}
