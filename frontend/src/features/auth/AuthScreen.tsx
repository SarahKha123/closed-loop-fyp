// The first screen: sign in, or create an account — with a password, or with Google when the backend has it
// configured. Shown by the root until someone is signed in; after that the page that was asked for (any URL) renders.
// A failed Google sign-in comes back as /?authError=<reason> (api/auth.py).

import { useState } from "react"
import type { FormEvent } from "react"
import { Button } from "../../components/ui/Button"
import { Icon } from "../../components/ui/Icon"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../lib/api"
import { input } from "../../lib/ui"

type Mode = "signin" | "signup"

const field = "flex flex-col gap-1 text-sm font-medium text-ink-muted"

const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  state: "That sign-in link expired. Please try again.",
}

/** The error a failed Google sign-in redirected back with, removed from the URL so a reload doesn't show it again. */
function takeAuthError(): string | null {
  const url = new URL(window.location.href)
  const reason = url.searchParams.get("authError")
  if (!reason) return null
  url.searchParams.delete("authError")
  window.history.replaceState(null, "", url)
  return GOOGLE_ERRORS[reason] ?? "Google sign-in failed. Please try again."
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function AuthScreen() {
  const { signedIn, googleSignIn } = useAuth()
  const [mode, setMode] = useState<Mode>("signin")
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(takeAuthError)
  const [busy, setBusy] = useState(false)

  const signup = mode === "signup"

  function switchTo(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = signup ? await api.register(username, displayName, password) : await api.login(username, password)
      signedIn(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : signup ? "Could not create the account" : "Sign in failed")
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
            <Icon name="logo" size={19} />
          </div>
          <div className="leading-tight">
            <div className="text-xl font-semibold">Closed Loop</div>
            <div className="text-sm text-ink-faint">Predictive maintenance</div>
          </div>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6 shadow-card">
          <div>
            <h1 className="text-xl font-semibold">{signup ? "Create an account" : "Sign in"}</h1>
            <p className="mt-1 text-base text-ink-muted">
              {signup ? "Your name is recorded on the work orders you close." : "Sign in to open the dashboard."}
            </p>
          </div>

          {googleSignIn && (
            <>
              {/* A real navigation, not fetch: the browser has to go to Google and back. */}
              <a
                href="/api/auth/google"
                className="inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface text-base font-medium text-ink transition-colors hover:bg-surface-2"
              >
                <GoogleMark /> Continue with Google
              </a>
              <div className="flex items-center gap-3 text-sm text-ink-faint">
                <span className="h-px grow bg-line" /> or with a username <span className="h-px grow bg-line" />
              </div>
            </>
          )}

          <label className={field}>
            Username
            <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required maxLength={100} className={input} />
          </label>
          {signup && (
            <label className={field}>
              Full name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" placeholder="e.g. Sarah Khalilah" maxLength={100} className={input} />
            </label>
          )}
          <label className={field}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 4 : undefined}
              maxLength={200}
              className={input}
            />
            {signup && <span className="text-xs font-normal text-ink-faint">At least 4 characters.</span>}
          </label>

          {error && (
            <div role="alert" className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical-text">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" disabled={busy} className="w-full justify-center">
            {busy ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
          </Button>

          <p className="text-center text-base text-ink-muted">
            {signup ? "Already have an account? " : "New here? "}
            <button type="button" onClick={() => switchTo(signup ? "signin" : "signup")} className="font-medium text-accent-text hover:underline">
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </form>

        {!signup && (
          <p className="mt-4 text-center text-sm text-ink-faint">
            Demo account: <span className="font-mono">demo</span> / <span className="font-mono">demo</span>
          </p>
        )}
      </div>
    </div>
  )
}
