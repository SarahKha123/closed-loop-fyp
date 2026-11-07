// Admin → Users: who is waiting for approval (the view's question, so it comes first and largest), then
// every account with its role, status and last sign-in. Every change goes through /api/admin and is
// refused there too when it would leave the server without an admin.

import { useCallback, useEffect, useState } from "react"
import { Card, CardHeader } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { confirmAction } from "../../components/ui/ConfirmDialog"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../lib/api"
import type { Account, Role } from "../../lib/api"
import { subscribe } from "../../lib/stream"
import { Avatar } from "./people"
import { ROLE_LABEL, ago } from "./labels"

type Note = { ok: boolean; text: string }

export function UsersView() {
  const me = useAuth().user!
  const { emailSetUp } = useAuth()
  const [users, setUsers] = useState<Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [note, setNote] = useState<Note | null>(null)

  const load = useCallback(() => {
    api.admin
      .users()
      .then((r) => {
        setUsers(r.users)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load accounts"))
  }, [])

  // A sign-up elsewhere arrives as an `accounts` event: the list follows without a reload.
  useEffect(() => {
    load()
    return subscribe((e) => e.type === "accounts" && load())
  }, [load])

  async function run(user: Account, action: () => Promise<{ user: Account; notice?: string | null }>, done: string) {
    setBusy(user.id)
    try {
      const r = await action()
      setUsers((cur) => cur?.map((u) => (u.id === r.user.id ? { ...u, ...r.user } : u)) ?? null)
      setNote(r.notice ? { ok: false, text: r.notice } : { ok: true, text: done })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work" })
    } finally {
      setBusy(null)
    }
  }

  const approve = (u: Account) =>
    run(u, () => api.admin.act(u.id, "approve"), `${u.displayName} can sign in now${emailSetUp && u.email ? " and was emailed" : ""}.`)

  async function reject(u: Account) {
    const ok = await confirmAction({
      title: `Reject ${u.displayName}?`,
      body: `${u.displayName} (${u.email ?? u.username}) won't be able to sign in. You can enable the account later from the list below.`,
      confirmLabel: "Reject",
    })
    if (ok) await run(u, () => api.admin.act(u.id, "reject"), `${u.displayName} was rejected.`)
  }

  async function disable(u: Account) {
    const self = u.id === me.id
    const ok = await confirmAction({
      title: self ? "Disable your own account?" : `Disable ${u.displayName}?`,
      body: self
        ? "You'll be signed out at once and can't sign back in until another admin enables you."
        : `${u.displayName} is signed out at once and can't sign in until you enable the account again. Their saved API keys are kept.`,
      confirmLabel: "Disable",
    })
    if (ok) await run(u, () => api.admin.act(u.id, "disable"), `${u.displayName} was disabled and signed out.`)
  }

  const enable = (u: Account) => run(u, () => api.admin.act(u.id, "enable"), `${u.displayName} can sign in again.`)
  const setRole = (u: Account, role: Role) =>
    run(u, () => api.admin.setRole(u.id, role), `${u.displayName} is now ${role === "admin" ? "an admin" : "an engineer"}.`)

  if (!users) {
    return error ? (
      <Card className="p-4 text-base text-critical-text">
        Couldn't load the accounts: {error}.{" "}
        <button type="button" className="font-medium underline" onClick={load}>
          Try again
        </button>
      </Card>
    ) : (
      <Card className="p-4 text-base text-ink-faint">Loading accounts…</Card>
    )
  }

  const pending = users.filter((u) => u.status === "pending")
  const others = users.filter((u) => u.status !== "pending")

  return (
    <div className="flex flex-col gap-5">
      {note && (
        <p key={note.text} role="status" className={`animate-page-in rounded-lg px-3 py-2 text-base ${note.ok ? "bg-good-bg text-good-text" : "bg-warning-bg text-warning-text"}`}>
          {note.text}
        </p>
      )}

      <Card>
        <CardHeader
          title="Waiting for approval"
          subtitle={
            pending.length
              ? `${pending.length} ${pending.length === 1 ? "person" : "people"} can't use the dashboard yet`
              : "Nobody is waiting"
          }
        />
        {pending.length === 0 ? (
          <p className="mx-4 mb-4 rounded-lg border border-dashed border-line-strong px-4 py-3 text-base text-ink-muted">
            New sign-ups appear here{emailSetUp ? ", and every admin gets an email" : ""}. They join as engineers.
          </p>
        ) : (
          <ul className="flex flex-col pb-2">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
                <Avatar name={u.displayName} src={u.avatarUrl} id={u.id} />
                <div className="min-w-0 grow">
                  <div className="truncate text-base font-semibold text-ink">{u.displayName}</div>
                  <div className="truncate text-sm text-ink-muted">
                    {u.email ?? u.username} · {u.google ? "Google" : "password"} · signed up {ago(u.createdAt)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="primary" size="sm" disabled={busy === u.id} onClick={() => void approve(u)}>
                    Approve
                  </Button>
                  <Button variant="danger" size="sm" disabled={busy === u.id} onClick={() => void reject(u)}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Accounts"
          subtitle={`${others.filter((u) => u.status === "active").length} active · ${others.filter((u) => u.role === "admin" && u.status === "active").length} admin`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-base">
            <thead>
              <tr className="text-left text-sm text-ink-muted">
                <th className="py-2 pl-4 font-normal">Name</th>
                <th className="py-2 font-normal">Role</th>
                <th className="py-2 font-normal">Status</th>
                <th className="py-2 pr-4 text-right font-normal">Last sign-in</th>
                <th className="w-28 py-2 pr-4">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {others.map((u) => {
                const self = u.id === me.id
                return (
                  <tr key={`${u.id}-${u.status}-${u.role}`} className="animate-page-in border-t border-line">
                    <td className="py-2.5 pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.displayName} src={u.avatarUrl} id={u.id} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">
                            {u.displayName}
                            {self && <span className="ml-1.5 text-sm font-normal text-ink-faint">(you)</span>}
                          </div>
                          <div className="truncate text-sm text-ink-muted">{u.email ?? u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <select
                        aria-label={`Role of ${u.displayName}`}
                        value={u.role}
                        disabled={busy === u.id || u.status !== "active"}
                        onChange={(e) => void setRole(u, e.target.value as Role)}
                        className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink disabled:opacity-60"
                      >
                        {(["engineer", "admin"] as const).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex h-6 flex-none items-center rounded-full px-2 text-sm font-medium whitespace-nowrap ${
                          u.status === "active" ? "bg-good-bg text-good-text" : "bg-surface-3 text-ink-muted"
                        }`}
                      >
                        {u.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-sm whitespace-nowrap text-ink-muted">{u.lastLoginAt ? ago(u.lastLoginAt) : "—"}</td>
                    <td className="py-2.5 pr-4 text-right">
                      {u.status === "active" ? (
                        <Button variant="ghost" size="sm" disabled={busy === u.id} onClick={() => void disable(u)}>
                          Disable
                        </Button>
                      ) : (
                        <Button size="sm" disabled={busy === u.id} onClick={() => void enable(u)}>
                          Enable
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-sm text-ink-faint">
          Engineers use the dashboard, the Advisor and their own API keys. Admins also approve accounts and change the
          settings that apply to everyone. There is always at least one admin.
        </p>
      </Card>
    </div>
  )
}
