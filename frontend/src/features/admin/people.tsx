// How a person looks on the Admin page: a stable identity tint per account, pale so it never reads as data.

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() : "?"
}

/** Google's picture when there is one, else initials on a pale tint whose hue comes from the account id:
 *  the golden angle keeps neighbouring ids far apart on the colour wheel. Mixed into the surface, so it
 *  stays pale in both themes. */
export function Avatar({ name, src, id }: { name: string; src: string | null; id: number }) {
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  const hue = Math.round((id * 137.508) % 360)
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
      style={{
        background: `color-mix(in oklch, oklch(0.72 0.11 ${hue}) 24%, var(--surface))`,
        color: `color-mix(in oklch, oklch(0.5 0.12 ${hue}) 75%, var(--ink))`,
      }}
    >
      {initials(name)}
    </span>
  )
}
