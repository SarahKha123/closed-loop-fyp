// Number and size formatting shared by every page.

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—"
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

/** 0.9734 → "97.3%" */
export function pct(p: number | null | undefined, digits = 1): string {
  return p == null ? "—" : `${(p * 100).toFixed(digits)}%`
}

/** 1665 → "1,665" */
export const num = (n: number | null | undefined): string => (n == null ? "—" : n.toLocaleString("en-US"))

/** A sensor value with sensible precision for its size. */
export function reading(v: number, unit?: string): string {
  const abs = Math.abs(v)
  const s = abs >= 1000 ? v.toFixed(0) : abs >= 100 ? v.toFixed(1) : abs >= 1 ? v.toFixed(2) : v.toFixed(3)
  return unit ? `${Number(s).toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}` : s
}
