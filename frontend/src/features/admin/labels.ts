// Role names and "3 days ago" times for the Admin page.

import type { Role } from "../../lib/api"

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", engineer: "Engineer" }

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function ago(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  if (Math.abs(seconds) < 60) return "just now"
  for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return "just now"
}
