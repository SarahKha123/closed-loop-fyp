// The first screen: sign in, or create an account. Shown by the root until someone is signed in;
// after that the page that was asked for (any URL) renders.

import { useState } from "react"
import type { FormEvent } from "react"
import { Button } from "../../components/ui/Button"
import { Icon } from "../../components/ui/Icon"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../lib/api"
import { input } from "../../lib/ui"

type Mode = "signin" | "signup"

const field = "flex flex-col gap-1 text-sm font-medium text-ink-muted"

export function AuthScreen() {
  const { signedIn } = useAuth()
  const [mode, setMode] = useState<Mode>("signin")
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
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
