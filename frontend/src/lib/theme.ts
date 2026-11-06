// Light / dark / system theme, stored per browser. Dark until someone picks otherwise; "system" follows the OS setting.

import { useEffect, useState } from "react"

export type Theme = "light" | "dark" | "system"
const KEY = "closed-loop:theme"

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "system" ? v : "dark"
  } catch {
    return "dark"
  }
}

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === "system") root.removeAttribute("data-theme")
  else root.setAttribute("data-theme", theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => {
    apply(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [theme])
  const isDark =
    theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  return { theme, isDark, setTheme, toggle: () => setTheme(isDark ? "light" : "dark") }
}
