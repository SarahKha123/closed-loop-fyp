// The sidebar's profile row: who is at the dashboard, opening to a menu with their profile, the theme and the AI models page.
// There is no login: the name and role are stored per browser, like the theme. A native popover gives
// light dismiss, Escape and focus return for free.

import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import type { useTheme, Theme } from "../../lib/theme"
import { input } from "../../lib/ui"
import { Button } from "../ui/Button"
import { Icon, type IconName } from "../ui/Icon"

const KEY = "closed-loop:profile"

interface Profile {
  name: string
  role: string
}

function read(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    return { name: typeof p.name === "string" ? p.name : "", role: typeof p.role === "string" ? p.role : "" }
  } catch {
    return { name: "", role: "" }
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
  const [profile, setProfile] = useState<Profile>(read)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  function save(e: React.FormEvent) {
    e.preventDefault()
    const next = { name: draft!.name.trim(), role: draft!.role.trim() }
    setProfile(next)
    setDraft(null)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* private mode: the profile just isn't remembered */
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
        <Avatar name={profile.name} size="sm" />
        <span className="min-w-0 grow">
          <span className="block truncate text-base font-medium text-ink">{profile.name || "Your profile"}</span>
          <span className="block truncate text-sm text-ink-faint">{profile.role || "Add your name and role"}</span>
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
          setDraft(isOpen && !profile.name ? { ...profile } : null)
        }}
        className="fixed inset-auto bottom-[76px] left-3 m-0 w-[264px] rounded-xl border border-line bg-surface p-2 text-ink shadow-pop"
      >
        {draft ? (
          <form onSubmit={save} className="flex flex-col gap-3 p-2">
            <div className="text-lg font-semibold">Your profile</div>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
              Name
              <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Sarah Khalilah" maxLength={60} className={`${input} h-9 py-0`} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink-muted">
              Role
              <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="e.g. Maintenance engineer" maxLength={60} className={`${input} h-9 py-0`} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save profile
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-3 p-2">
              <Avatar name={profile.name} size="lg" />
              <div className="min-w-0 grow">
                <div className="truncate text-lg font-semibold">{profile.name || "Your profile"}</div>
                <div className="truncate text-sm text-ink-muted">{profile.role || "No role set"}</div>
              </div>
            </div>
            <button type="button" className={menuItem} onClick={() => setDraft({ ...profile })}>
              <Icon name="user" className="text-ink-muted" /> Edit profile
            </button>
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
