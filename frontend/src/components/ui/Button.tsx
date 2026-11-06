// Buttons: primary (one per area), secondary (bordered), ghost (toolbar / icon).

import type { ButtonHTMLAttributes } from "react"

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-muted hover:bg-surface-3 hover:text-ink border border-transparent",
  danger: "bg-surface text-critical-text border border-line-strong hover:bg-critical-bg",
} as const

const sizes = { sm: "h-8 px-3 text-sm gap-1.5", md: "h-9 px-3.5 text-base gap-2", icon: "h-9 w-9 justify-center" } as const

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}
