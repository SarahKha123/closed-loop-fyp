// A responsive multi-series line chart in plain SVG, following the data-viz method:
// 2px lines, hairline grid, one y-axis, a legend for ≥2 series, end labels only where
// they don't collide, and a crosshair + tooltip on hover. Text uses ink tokens, never
// the series colour; identity comes from the coloured key beside it.

import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useSize } from "./useSize"

export interface Series {
  name: string
  color: string
  values: (number | null)[]
}

interface Props {
  x: number[]
  series: Series[]
  yMax?: number
  yFormat?: (v: number) => string
  xFormat?: (v: number) => string
  tooltipExtra?: (index: number, series: Series) => ReactNode
  height?: number | "fill"
  legend?: boolean
}

const PAD = { top: 10, right: 118, bottom: 24, left: 40 }
const LABEL_GAP = 13

function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Math.round(v))
  return out
}

export function LineChart({
  x,
  series,
  yMax = 1,
  yFormat = (v) => `${Math.round(v * 100)}%`,
  xFormat = (v) => v.toLocaleString("en-US"),
  tooltipExtra,
  height = "fill",
  legend = true,
}: Props) {
  const [ref, size] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const w = size.width
  const h = height === "fill" ? size.height : height
  const innerW = Math.max(0, w - PAD.left - PAD.right)
  const innerH = Math.max(0, h - PAD.top - PAD.bottom)

  const xMin = x[0] ?? 0
  const xMax = x[x.length - 1] ?? 1
  const sx = (v: number) => PAD.left + (xMax === xMin ? innerW : ((v - xMin) / (xMax - xMin)) * innerW)
  const sy = (v: number) => PAD.top + innerH - (v / yMax) * innerH

  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = ""
        let pen = false
        s.values.forEach((v, i) => {
          if (v == null) {
            pen = false
            return
          }
          d += `${pen ? "L" : "M"}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`
          pen = true
        })
        return d
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, x, w, h],
  )

  // End labels: last value of each series; drop any that would collide with one already placed.
  const endLabels = useMemo(() => {
    const ends = series
      .map((s) => {
        for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] != null) return { s, i, y: sy(s.values[i] as number) }
        return null
      })
      .filter((e): e is { s: Series; i: number; y: number } => e !== null)
      .sort((a, b) => a.y - b.y)
    const placed: typeof ends = []
    for (const e of ends) if (placed.every((p) => Math.abs(p.y - e.y) >= LABEL_GAP)) placed.push(e)
    return { all: ends, labelled: placed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, w, h])

  const yTicks = niceTicks(0, yMax * 100, 4).map((t) => t / 100)
  const xTicks = x.length > 1 ? niceTicks(xMin, xMax, Math.max(2, Math.floor(innerW / 90))) : x

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    if (!x.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = xMin + ((e.clientX - rect.left) / rect.width) * (xMax - xMin)
    let best = 0
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - cx) < Math.abs(x[best] - cx)) best = i
    setHover(best)
  }

  const tipLeft = hover != null ? sx(x[hover]) : 0
  const tipOnLeft = tipLeft > w - 220

  return (
    <div className="flex h-full min-h-0 flex-col">
      {legend && series.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 text-[12px] text-ink-muted">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden" style={height === "fill" ? undefined : { height }}>
        {w > 0 && h > 0 && (
          <svg width={w} height={h} className="block overflow-visible" role="img" aria-label={`Line chart: ${series.map((s) => s.name).join(", ")}`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="tabular fill-ink-faint text-[11px]">
                  {yFormat(t)}
                </text>
              </g>
            ))}
            <line x1={PAD.left} x2={PAD.left + innerW} y1={sy(0)} y2={sy(0)} stroke="var(--baseline)" strokeWidth={1} />
            {xTicks.map((t) => (
              <text key={t} x={sx(t)} y={h - 6} textAnchor="middle" className="tabular fill-ink-faint text-[11px]">
                {xFormat(t)}
              </text>
            ))}

            {paths.map((d, i) => (
              <path key={series[i].name} d={d} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {endLabels.all.map(({ s, i, y }) => (
              <circle key={s.name} cx={sx(x[i])} cy={y} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
            {endLabels.labelled.map(({ s, i, y }) => (
              <text key={s.name} x={sx(x[i]) + 9} y={y} dy="0.32em" className="fill-ink-muted text-[11.5px]">
                {s.name} <tspan className="tabular fill-ink-faint">{yFormat(s.values[i] as number)}</tspan>
              </text>
            ))}

            {hover != null && (
              <g pointerEvents="none">
                <line x1={sx(x[hover])} x2={sx(x[hover])} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--baseline)" strokeWidth={1} />
                {series.map((s) =>
                  s.values[hover] == null ? null : (
                    <circle key={s.name} cx={sx(x[hover])} cy={sy(s.values[hover] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  ),
                )}
              </g>
            )}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop"
            style={tipOnLeft ? { right: w - tipLeft + 12 } : { left: tipLeft + 12 }}
          >
            <div className="mb-1 font-semibold text-ink">Cycle {xFormat(x[hover])}</div>
            {series.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-4 py-0.5">
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="tabular font-medium text-ink">
                  {s.values[hover] == null ? "—" : yFormat(s.values[hover] as number)}
                  {tooltipExtra?.(hover, s)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
