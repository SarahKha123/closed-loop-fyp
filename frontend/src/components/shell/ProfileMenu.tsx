// The sidebar's profile row: who is at the dashboard, opening to a menu with their account, their email
// settings, the theme and the AI models (and, for admins, Admin) pages.
// Shows the signed-in account (AuthContext) — the name work orders record as `closedBy` — its role, and
// Log out. The job title is a per-browser label, like the theme; the role (Admin / Engineer) is the account's.
// A native popover gives light dismiss, Escape and focus return for free.

import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../lib/api"
import type { useTheme, Theme } from "../../lib/theme"
import { inputCompact } from "../../lib/ui"
import { Button } from "../ui/Button"
import { Icon, type IconName } from "../ui/Icon"
import { TOUR_EVENT } from "./Tour"

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

function Avatar({ name, src, size }: { name: string; src: string | null; size: "sm" | "lg" }) {
  const box = size === "sm" ? "h-9 w-9 text-sm" : "h-11 w-11 text-base"
  // no-referrer: Google's image host can refuse requests that carry one.
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" className={`shrink-0 rounded-full object-cover ${box}`} />
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-ink ${box}`}>
      {initials(name) || <Icon name="user" size={size === "sm" ? 16 : 20} />}
    </span>
  )
}

const THEMES: { value: Theme; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
]

const ROLE_LABEL = { admin: "Admin", engineer: "Engineer" } as const

const menuItem = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-base text-ink hover:bg-surface-3"

export function ProfileMenu({ studyMode, theme }: { studyMode: boolean; theme: ReturnType<typeof useTheme> }) {
  const auth = useAuth()
  const user = auth.user!
  const [role, setRole] = useState(readRole)
  const [editingRole, setEditingRole] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  function saveRole(next: string) {
    setRole(next)
    setEditingRole(false)
    try {
      localStorage.setItem(ROLE_KEY, JSON.stringify({ role: next }))
    } catch {
      /* private mode: the role just isn't remembered */
    }
  }

  const name = user.displayName

  async function setNotify(on: boolean) {
    try {
      auth.signedIn((await api.updateMe({ notifyWorkOrders: on })).user)
      setEmailError(null)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "could not save")
    }
  }

  return (
    <>
      <button
        type="button"
        popoverTarget="profile-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-3 ${open ? "bg-surface-3" : ""}`}
      >
        <Avatar name={name} src={user.avatarUrl} size="sm" />
        <span className="min-w-0 grow max-lg:sr-only">
          <span className="block truncate text-base font-medium text-ink">{name}</span>
          <span className="block truncate text-sm text-ink-faint">{role || ROLE_LABEL[user.role]}</span>
        </span>
        <Icon name="chevronUpDown" size={16} className="text-ink-faint max-lg:hidden" />
      </button>

      <div
        ref={menu}
        id="profile-menu"
        popover="auto"
        onToggle={(e) => {
          const isOpen = (e.nativeEvent as ToggleEvent).newState === "open"
          setOpen(isOpen)
          if (!isOpen) {
            setEditingRole(false)
            setEditingEmail(false)
          }
        }}
        className="fixed inset-auto bottom-[76px] left-3 m-0 w-[264px] rounded-xl border border-line bg-surface p-2 text-ink shadow-pop"
      >
        {editingRole ? (
          <RoleForm initial={role} onCancel={() => setEditingRole(false)} onSave={saveRole} />
        ) : editingEmail ? (
          <EmailForm initial={user.email ?? ""} onDone={() => setEditingEmail(false)} />
        ) : (
          <>
            <div className="flex items-center gap-3 p-2">
              <Avatar name={name} src={user.avatarUrl} size="lg" />
              <div className="min-w-0 grow">
                <div className="truncate text-lg font-semibold">{name}</div>
                <div className="truncate text-sm text-ink-muted">{`${user.username} · ${ROLE_LABEL[user.role]}`}</div>
                {role && <div className="truncate text-sm text-ink-faint">{role}</div>}
              </div>
            </div>
            <button type="button" className={menuItem} onClick={() => setEditingRole(true)}>
              <Icon name="user" className="text-ink-muted" /> {role ? "Edit job title" : "Add your job title"}
            </button>
            {!studyMode && (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  menu.current?.hidePopover()
                  window.dispatchEvent(new Event(TOUR_EVENT))
                }}
              >
                <Icon name="help" className="text-ink-muted" /> Guide to this page
              </button>
            )}
            <button type="button" className={menuItem} onClick={() => void auth.logout()}>
              <Icon name="logout" className="text-ink-muted" /> Log out
            </button>
            {!studyMode && (
              <Link to="/models" className={`${menuItem} !text-ink`} onClick={() => menu.current?.hidePopover()}>
                <Icon name="models" className="text-ink-muted" /> AI models
              </Link>
            )}
            {user.role === "admin" && (
              <Link to="/admin" className={`${menuItem} !text-ink`} onClick={() => menu.current?.hidePopover()}>
                <Icon name="shield" className="text-ink-muted" /> Admin
              </Link>
            )}

            <div className="my-2 border-t border-line" />
            {/* The person's own email settings: where work-order emails go, and whether they want them. */}
            <label className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${user.email ? "hover:bg-surface-3" : ""}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                checked={user.notifyWorkOrders && Boolean(user.email)}
                disabled={!user.email}
                onChange={(e) => void setNotify(e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-base text-ink">Email me when a work order opens</span>
                <span className="block truncate text-sm text-ink-faint">{user.email ?? "Add your email first"}</span>
              </span>
            </label>
            {emailError && <p role="alert" className="px-2.5 pb-1 text-sm text-critical-text">{emailError}</p>}
            <button type="button" className={menuItem} onClick={() => setEditingEmail(true)}>
              <Icon name="mail" className="text-ink-muted" /> {user.email ? "Change email" : "Add your email"}
            </button>

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

function EmailForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const auth = useAuth()
  const [email, setEmail] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        api
          .updateMe({ email: email.trim() })
          .then((r) => {
            auth.signedIn(r.user)
            onDone()
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "could not save")
            setBusy(false)
          })
      }}
      className="flex flex-col gap-3 p-2"
    >
      <div className="text-lg font-semibold">Your email</div>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
        Email
        <input
          autoFocus
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "email-error" : undefined}
          maxLength={200}
          className={inputCompact}
        />
      </label>
      {error && <p id="email-error" role="alert" className="text-sm text-critical-text">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          Save
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
      <div className="text-lg font-semibold">Your job title</div>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
        Job title
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
