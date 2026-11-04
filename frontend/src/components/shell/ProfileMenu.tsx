// The sidebar's profile row: who is at the dashboard, opening to a menu with their account, the theme and the AI models page.
// Backed by the demo login (/api/auth, a session cookie): logged out it offers Log in; logged in it shows the account's
// name — the name work orders record as `closedBy` — and Log out. The role is a per-browser label, like the theme.
// A native popover gives light dismiss, Escape and focus return for free.

import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { api } from "../../lib/api"
import type { User } from "../../lib/api"
import type { useTheme, Theme } from "../../lib/theme"
import { inputCompact } from "../../lib/ui"
import { Button } from "../ui/Button"
import { Icon, type IconName } from "../ui/Icon"

const ROLE_KEY = "closed-loop:profile"

function readRole(): string {
  try {
    const p = JSON.parse(localStorage.getItem(ROLE_KEY) ?? "{}")
    return typeof p.role === "string" ? p.role : ""
  } catch {
    return ""
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() : ""
}

function Avatar({ name, size }: { name: string; size: "sm" | "lg" }) {
  const box = size === "sm" ? "h-9 w-9 text-sm" : "h-11 w-11 text-base"
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-accent-bg font-semibold text-accent-text ${box}`}>
      {initials(name) || <Icon name="user" size={size === "sm" ? 16 : 20} />}
    </span>
  )
}

const THEMES: { value: Theme; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
]

const menuItem = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-base text-ink hover:bg-surface-3"

export function ProfileMenu({ studyMode, theme }: { studyMode: boolean; theme: ReturnType<typeof useTheme> }) {
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = still asking the backend
  const [role, setRole] = useState(readRole)
  const [form, setForm] = useState<"login" | "role" | null>(null)
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
  }, [])

  function saveRole(next: string) {
    setRole(next)
    setForm(null)
    try {
      localStorage.setItem(ROLE_KEY, JSON.stringify({ role: next }))
    } catch {
      /* private mode: the role just isn't remembered */
    }
  }

  async function logout() {
    menu.current?.hidePopover()
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }

  const name = user?.displayName ?? ""

  return (
    <>
      <button
        type="button"
        popoverTarget="profile-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-3 ${open ? "bg-surface-3" : ""}`}
      >
        <Avatar name={name} size="sm" />
        <span className="min-w-0 grow">
          <span className="block truncate text-base font-medium text-ink">{user ? name : "Log in"}</span>
          <span className="block truncate text-sm text-ink-faint">
            {user ? role || user.username : user === null ? "Sign in to record who closes work orders" : "…"}
          </span>
        </span>
        <Icon name="chevronUpDown" size={16} className="text-ink-faint" />
      </button>

      <div
        ref={menu}
        id="profile-menu"
        popover="auto"
        onToggle={(e) => {
          const isOpen = (e.nativeEvent as ToggleEvent).newState === "open"
          setOpen(isOpen)
          setForm(isOpen && user === null ? "login" : null)
        }}
        className="fixed inset-auto bottom-[76px] left-3 m-0 w-[264px] rounded-xl border border-line bg-surface p-2 text-ink shadow-pop"
      >
        {form === "login" ? (
          <LoginForm
            onCancel={() => setForm(null)}
            onLoggedIn={(u) => {
              setUser(u)
              setForm(null)
            }}
          />
        ) : form === "role" ? (
          <RoleForm initial={role} onCancel={() => setForm(null)} onSave={saveRole} />
        ) : (
          <>
            <div className="flex items-center gap-3 p-2">
              <Avatar name={name} size="lg" />
              <div className="min-w-0 grow">
                <div className="truncate text-lg font-semibold">{user ? name : "Not signed in"}</div>
                <div className="truncate text-sm text-ink-muted">{user ? `${user.username}${role ? ` · ${role}` : ""}` : "Work orders you close are recorded as anonymous"}</div>
              </div>
            </div>
            {user ? (
              <>
                <button type="button" className={menuItem} onClick={() => setForm("role")}>
                  <Icon name="user" className="text-ink-muted" /> {role ? "Edit role" : "Add your role"}
                </button>
                <button type="button" className={menuItem} onClick={() => void logout()}>
                  <Icon name="logout" className="text-ink-muted" /> Log out
                </button>
              </>
            ) : (
              <button type="button" className={menuItem} onClick={() => setForm("login")}>
                <Icon name="login" className="text-ink-muted" /> Log in
              </button>
            )}
            {!studyMode && (
              <Link to="/models" className={`${menuItem} !text-ink`} onClick={() => menu.current?.hidePopover()}>
                <Icon name="models" className="text-ink-muted" /> AI models
              </Link>
            )}

            <div className="my-2 border-t border-line" />
            <div className="px-2.5 pb-1.5 text-sm font-medium text-ink-muted">Theme</div>
            <div className="mx-2 mb-2 flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme.theme === t.value}
                  onClick={() => theme.setTheme(t.value)}
                  className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium ${
                    theme.theme === t.value ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Icon name={t.icon} size={14} /> {t.label}
                </button>
              ))}
            </div>

            <div className="border-t border-line px-2.5 pt-2 pb-1 text-xs text-ink-faint">FYP · Universiti Teknologi PETRONAS</div>
          </>
        )}
      </div>
    </>
  )
}

function LoginForm({ onCancel, onLoggedIn }: { onCancel: () => void; onLoggedIn: (user: User) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(username, password)
      onLoggedIn(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 p-2">
      <div className="text-lg font-semibold">Log in</div>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
        Username
        <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required className={inputCompact} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={inputCompact} />
      </label>
      {error && <div className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical-text">{error}</div>}
      <div className="text-xs text-ink-faint">
        Demo account: <span className="font-mono">demo</span> / <span className="font-mono">demo</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy || !username || !password}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </div>
    </form>
  )
}

function RoleForm({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (role: string) => void }) {
  const [role, setRole] = useState(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(role.trim())
      }}
      className="flex flex-col gap-3 p-2"
    >
      <div className="text-lg font-semibold">Your role</div>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
        Role
        <input autoFocus value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Maintenance engineer" maxLength={60} className={inputCompact} />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  )
}
