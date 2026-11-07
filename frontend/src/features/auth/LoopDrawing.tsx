// The sign-in page's picture: the rig's closed hydraulic loop, running. Fluid flows round the loop; every packet is
// one cycle, and each component's outline lights as a packet reaches it (it has just been scored), while the cycle
// count under the drawing ticks once per packet. Purely illustrative: no data is fetched before sign-in.
// Reduced motion: the loop is drawn still and the counter stays put.

import { useEffect, useState } from "react"

const LOOP = "M20 75 V25 H380 V125 H20 Z" // tank → pump → valve → load → cooler → tank; 920 units long
const LENGTH = 920
const BRANCH = "M160 25 V88" // the accumulator tees off the pressure line
const LAP = 7.5 // seconds for one packet to go round
const PACKETS = 3 // so a packet (a cycle) passes every LAP / PACKETS seconds
const BEAT = LAP / PACKETS
const TEE = (((50 + 140) / LENGTH) * LAP) % BEAT // when, within a beat, a packet passes the accumulator's tee

// Where each component sits, and how far round the loop (from the tank) a packet reaches it.
const NODES = [
  { name: "Pump", x: 90, y: 25, at: 50 + 70, c: "var(--series-3)" },
  { name: "Valve", x: 270, y: 25, at: 50 + 250, c: "var(--series-2)" },
  { name: "Accumulator", x: 160, y: 88, at: 50 + 140, c: "var(--series-4)" },
  { name: "Cooler", x: 200, y: 125, at: 50 + 360 + 100 + 180, c: "var(--series-1)" },
]

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function LoopDrawing() {
  const [still] = useState(reduced)
  const [cycle, setCycle] = useState(1665) // the replay's first all-healthy cycle
  useEffect(() => {
    if (still) return
    const id = window.setInterval(() => setCycle((c) => (c >= 2205 ? 1665 : c + 1)), BEAT * 1000)
    return () => window.clearInterval(id)
  }, [still])

  return (
    <figure className="w-full max-w-[640px]">
      <svg viewBox="0 0 400 150" className="w-full overflow-visible" role="img" aria-label="The rig's hydraulic loop: pump, valve, accumulator and cooler">
        <defs>
          <filter id="packet-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        {/* The pipe, then the fluid in it: a dashed line that drifts in the direction of flow. */}
        {[LOOP, BRANCH].map((d) => (
          <g key={d}>
            <path d={d} fill="none" stroke="var(--surface-3)" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
            <path
              d={d}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.45"
              strokeWidth="1.5"
              strokeDasharray="5 7"
              strokeLinejoin="round"
              className={still ? "" : "animate-flow"}
            />
          </g>
        ))}

        {/* Packets: a bright head with a soft halo and a short fading tail, riding the loop. */}
        {!still &&
          Array.from({ length: PACKETS }, (_, k) => (
            <g key={k}>
              {[0, 0.07, 0.14].map((lag, i) => (
                <g key={lag} opacity={1 - i * 0.35}>
                  {i === 0 && <circle r="7" fill="var(--accent)" opacity="0.35" filter="url(#packet-glow)" />}
                  <circle r={3.2 - i * 0.8} fill={i === 0 ? "var(--accent-text)" : "var(--accent)"} />
                  {/* Negative begin: already running on first paint, never parked at the corner. */}
                  <animateMotion dur={`${LAP}s`} begin={`${-k * BEAT + lag - LAP}s`} repeatCount="indefinite" path={LOOP} />
                </g>
              ))}
            </g>
          ))}
        {/* Pressure into the accumulator: a small pulse down the branch each cycle. */}
        {!still && (
          <circle r="2.4" fill="var(--accent)">
            <animateMotion dur={`${BEAT}s`} begin={`${TEE - BEAT}s`} repeatCount="indefinite" path={BRANCH} keyPoints="0;1;1" keyTimes="0;0.5;1" calcMode="linear" />
            <animate attributeName="opacity" dur={`${BEAT}s`} begin={`${TEE - BEAT}s`} values="1;0.2;0;0" keyTimes="0;0.45;0.5;1" repeatCount="indefinite" />
          </circle>
        )}

        {NODES.map((n) => {
          const w = 30 + n.name.length * 7
          // A packet reaches this node at (at / LENGTH) of a lap; packets come every BEAT, so the flash repeats per BEAT.
          const phase = (((n.at / LENGTH) * LAP) % BEAT) / BEAT
          const t = (x: number) => Math.min(1, Math.max(0, x)).toFixed(3)
          const keyTimes = `0;${t(phase - 0.01)};${t(phase)};${t(phase + 0.18)};1`
          return (
            <g key={n.name} transform={`translate(${n.x} ${n.y})`}>
              <rect x={-w / 2} y="-13" width={w} height="26" rx="4" fill="var(--surface)" stroke="var(--border-strong)" />
              {/* The accent outline that lights as the packet arrives, then fades. */}
              {!still && (
                <rect x={-w / 2} y="-13" width={w} height="26" rx="4" fill="none" stroke="var(--accent)" strokeWidth="1.25" strokeOpacity="0">
                  <animate attributeName="stroke-opacity" dur={`${BEAT}s`} repeatCount="indefinite" keyTimes={keyTimes} values="0;0;1;0;0" />
                </rect>
              )}
              <rect x={-w / 2 + 9} y="-3.5" width="7" height="7" rx="1.5" fill={n.c} />
              <text x={-w / 2 + 22} y="4.3" fontSize="12" fill="var(--ink)" fontFamily="IBM Plex Sans, sans-serif">
                {n.name}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-4 flex items-baseline gap-2 text-sm text-ink-muted">
        <span key={cycle} className={`tabular text-base text-ink ${still ? "" : "animate-value"}`}>
          Cycle {cycle.toLocaleString("en-US")}
        </span>
        scored on all four components
      </figcaption>
    </figure>
  )
}
