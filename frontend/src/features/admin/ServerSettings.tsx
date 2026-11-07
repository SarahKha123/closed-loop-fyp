// Admin → Email and Admin → Google sign-in: whether the static secrets in .env are set (SMTP_USER /
// SMTP_APP_PASSWORD, GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), and what an admin can do from here: send a
// test email, copy the redirect URI for Google. The secrets themselves never reach the browser.
// Each view is a settings row: what it is and how to set it up on the left, its status on the right.

import { useEffect, useId, useState } from "react"
import type { ReactNode } from "react"
import { Button } from "../../components/ui/Button"
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
  return { config, error }
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

/** On/off with what it means, then the .env lines that set it. */
function Status({ on, onText, offText, keys }: { on: boolean; onText: ReactNode; offText: ReactNode; keys: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-base text-ink">
        <span aria-hidden className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-good" : "bg-ink-faint"}`} />
        <span>{on ? onText : offText}</span>
      </p>
      <pre className="overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-muted">
        <code>{keys.map((k) => `${k}=${on ? "…" : ""}`).join("\n")}</code>
      </pre>
    </div>
  )
}

const external = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text} ↗
  </a>
)

const loading = (error: string | null) => <p className="text-base text-ink-faint">{error ? `Couldn't load: ${error}` : "Loading…"}</p>

export function EmailView() {
  const { config, error } = useServerConfig()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)

  async function test() {
    setBusy(true)
    try {
      const r = await api.admin.testEmail()
      setNote({ ok: true, text: `Sent to ${r.to}. Check the inbox (and spam, the first time).` })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "could not send" })
    } finally {
      setBusy(false)
    }
  }

  if (!config) return loading(error)
  const { sender, configured } = config.email

  return (
    <SettingsRow
      title="Gmail sender"
      about="The Gmail account every email comes from: sign-ups to the admins, approvals to the applicant, and new work orders to everyone who asked for them."
      steps={[
        <>Use a personal Gmail. School and work accounts usually can't make App Passwords.</>,
        <>Turn on {external("https://myaccount.google.com/signinoptions/twosv", "2-Step Verification")}, then create an {external("https://myaccount.google.com/apppasswords", "App Password")}.</>,
        <>Put both in <code>.env</code> on the server (the password without spaces) and restart.</>,
      ]}
    >
      <div className={`${card} flex flex-col gap-4 p-4`}>
        <Status
          on={configured}
          onText={<>Sending from <span className="font-medium">{sender}</span>.</>}
          offText="Not set up: no email goes out. Approvals still work; you tell people yourself."
          keys={["SMTP_USER", "SMTP_APP_PASSWORD"]}
        />
        {note && (
          <p role="status" className={`text-sm ${note.ok ? "text-good-text" : "text-critical-text"}`}>
            {note.text}
          </p>
        )}
        <div>
          <Button disabled={busy || !configured || !user?.email} onClick={() => void test()}>
            {busy ? "Sending…" : `Send a test to ${user?.email ?? "you"}`}
          </Button>
          {!user?.email && <p className="mt-2 text-sm text-ink-muted">Add your email in the profile menu to send a test.</p>}
        </div>
      </div>

      {/* What the setting produces: the approval email as the applicant receives it. */}
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm text-ink-muted">What an approved applicant receives</figcaption>
        <div className="rounded-xl bg-surface-2 p-4 text-base">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-ink-faint">From</dt>
            <dd className="min-w-0 truncate text-ink">Closed Loop &lt;{sender ?? "your Gmail"}&gt;</dd>
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
  const { config, error } = useServerConfig()
  const [copied, setCopied] = useState(false)
  const uriId = useId()

  if (!config) return loading(error)
  const { configured, clientId, redirectUri } = config.google

  async function copy() {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      ;(document.getElementById(uriId) as HTMLInputElement | null)?.select() // no clipboard access: select it for Ctrl+C
    }
  }

  return (
    <SettingsRow
      title="Google sign-in"
      about="Lets people sign in with their Google account. New Google accounts wait for approval like any other sign-up."
      steps={[
        <>In the {external("https://console.cloud.google.com/auth/clients", "Google Cloud console")}, create an OAuth client of type Web application.</>,
        <>Add the redirect URI below to it, exactly as shown, and this site's address as a JavaScript origin.</>,
        <>Put the client ID and secret in <code>.env</code> on the server and restart.</>,
      ]}
    >
      <div className={`${card} flex flex-col gap-4 p-4`}>
        <Status
          on={configured}
          onText={<>On: the sign-in page offers Continue with Google{clientId ? <> (client <span className="break-all">{clientId}</span>)</> : null}.</>}
          offText="Off: the sign-in page offers only a username and password."
          keys={["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
          Redirect URI
          {/* A joined field and action: one border, squared inner corners. */}
          <span className="flex">
            <input id={uriId} readOnly value={redirectUri} onFocus={(e) => e.target.select()} className={`${input} grow rounded-r-none text-sm`} />
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-r-lg border border-l-0 border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
            </button>
          </span>
          <span className="text-sm font-normal text-ink-faint">Paste this into the client's Authorized redirect URIs. Set APP_URL in .env when deployed.</span>
        </label>
      </div>
    </SettingsRow>
  )
}
