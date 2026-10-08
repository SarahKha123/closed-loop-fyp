// A tiny single-series trend: 2px line, a 10 % area wash, and an end dot. No axes; the card around it gives context.

import { useSize } from "./useSize"

export function Sparkline({ values, color, max = 1, height = 36 }: { values: (number | null)[]; color: string; max?: number; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const pts = values.map((v, i) => (v == null ? null : ([i, v] as const))).filter((p): p is readonly [number, number] => p !== null)
  const n = Math.max(values.length - 1, 1)
  const pad = 4
  const sx = (i: number) => pad + (i / n) * (width - pad * 2)
  const sy = (v: number) => pad + (1 - v / max) * (height - pad * 2)
  const line = pts.map(([i, v], k) => `${k ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("")
  const area = pts.length ? `${line}L${sx(pts[pts.length - 1][0]).toFixed(1)},${height - pad}L${sx(pts[0][0]).toFixed(1)},${height - pad}Z` : ""
  const last = pts[pts.length - 1]
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 && pts.length > 0 && (
        <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
          <path d={area} fill={color} opacity={0.1} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last && <circle cx={sx(last[0])} cy={sy(last[1])} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />}
        </svg>
      )}
    </div>
  )
}
