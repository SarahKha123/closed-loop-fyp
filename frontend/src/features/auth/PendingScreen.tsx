// A signed-up account an admin hasn't approved yet. It reaches nothing but this screen (the API answers 403),
// so it says plainly what happens next, checks again on its own every 30 s and when the tab comes back,
// and opens the dashboard the moment the account is approved.

import { useEffect, useState } from "react"
import { Button } from "../../components/ui/Button"
import { useAuth } from "../../context/AuthContext"
import type { User } from "../../lib/api"
import { AuthLayout } from "./AuthScreen"

const RECHECK_MS = 30_000

export function PendingScreen({ user }: { user: User }) {
  const { reload, logout } = useAuth()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => void reload(), RECHECK_MS)
    const onVisible = () => document.visibilityState === "visible" && void reload()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [reload])

  async function checkNow() {
    setChecking(true)
    await reload()
    setChecking(false)
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-2xl font-semibold">Waiting for approval</h2>
          <p className="mt-2 text-base text-ink">
            Thanks, {user.displayName}. An admin has to approve your account before you can open the dashboard.
          </p>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-surface-2 px-4 py-3 text-base">
          <dt className="text-ink-muted">Account</dt>
          <dd className="min-w-0 truncate text-ink">{user.username}</dd>
          <dt className="text-ink-muted">We'll email</dt>
          <dd className="min-w-0 truncate text-ink">{user.email ?? "—"}</dd>
        </dl>

        <p className="text-sm text-ink-muted">
          Your request is on the admins' list. This page checks again by itself and opens the dashboard as soon as you're in.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={checking} onClick={() => void checkNow()}>
            {checking ? "Checking…" : "Check now"}
          </Button>
          <Button onClick={() => void logout()}>Sign out</Button>
        </div>
      </div>
    </AuthLayout>
  )
}
