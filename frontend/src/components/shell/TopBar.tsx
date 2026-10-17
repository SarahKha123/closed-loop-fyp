// The bar above every page: whether the feed is live, the replay controls, theme and Advisor toggles.
// In study mode the researcher drives the replay, so participants see the position but no controls.

import { useState } from "react"
import { useLive } from "../../context/LiveContext"
import { num } from "../../lib/format"
import type { Theme } from "../../lib/theme"
import { Button } from "../ui/Button"
import { Icon } from "../ui/Icon"

const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5]

export function TopBar({
  theme,
  onToggleTheme,
  advisorOpen,
  onToggleAdvisor,
  showAdvisorToggle,
  studyMode,
}: {
  theme: { isDark: boolean; theme: Theme }
  onToggleTheme: () => void
  advisorOpen: boolean
  onToggleAdvisor: () => void
  showAdvisorToggle: boolean
  studyMode: boolean
}) {
  const { replay, connection, control, controlError } = useLive()
  const [seekTo, setSeekTo] = useState("")

  const status =
    connection !== "open" ? "offline" : !replay ? "unavailable" : replay.state === "playing" ? "live" : replay.state
  const statusStyle = {
    live: { dot: "bg-good animate-live", text: "Live", tone: "text-good-text" },
    paused: { dot: "bg-ink-faint", text: "Paused", tone: "text-ink-muted" },
    finished: { dot: "bg-ink-faint", text: "Finished", tone: "text-ink-muted" },
    offline: { dot: "bg-critical", text: connection === "connecting" ? "Connecting…" : "Offline", tone: "text-critical-text" },
    unavailable: { dot: "bg-warning", text: "No data", tone: "text-warning-text" },
  }[status]

  const progress = replay?.cycle ? (replay.cycle / replay.total) * 100 : 0

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 py-1 pr-1 pl-3">
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${statusStyle.tone}`}>
          <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
          {statusStyle.text}
        </span>
        <span className="h-4 w-px bg-line-strong" />
        <div className="flex flex-col justify-center" title="Replay position">
          <span className="tabular text-[12px] text-ink">
            Cycle <b className="font-semibold">{num(replay?.cycle ?? null)}</b>
            <span className="text-ink-faint"> / {num(replay?.total ?? 2205)}</span>
          </span>
          <span className="mt-0.5 h-1 w-[120px] overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </span>
        </div>
        {!studyMode && <>
        <span className="h-4 w-px bg-line-strong" />
        {replay?.state === "playing" ? (
          <Button size="sm" variant="primary" onClick={() => void control.pause()} aria-label="Pause replay">
            <Icon name="pause" size={12} /> Pause
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => void control.play()} disabled={!replay || replay.state === "finished"} aria-label="Play replay">
            <Icon name="play" size={12} /> Play
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void control.step()} disabled={!replay || replay.state !== "paused"} title="Step one cycle" aria-label="Step one cycle">
          <Icon name="step" size={12} />
        </Button>
        <label className="sr-only" htmlFor="replay-speed">
          Seconds per cycle
        </label>
        <select
          id="replay-speed"
          value={replay?.secondsPerCycle ?? 2}
          onChange={(e) => void control.speed(Number(e.target.value))}
          disabled={!replay}
          className="h-7 rounded-md border border-line-strong bg-surface px-1.5 text-[12px] text-ink"
          title="Seconds per cycle"
        >
          {/* Include the current speed even if it was set elsewhere (e.g. through the API). */}
          {[...new Set([...SPEEDS, replay?.secondsPerCycle ?? 2])].sort((a, b) => a - b).map((s) => (
            <option key={s} value={s}>
              {s}s / cycle
            </option>
          ))}
        </select>
        <form
          className="flex items-center"
          onSubmit={(e) => {
            e.preventDefault()
            const c = Number(seekTo)
            if (c >= 1) void control.seek(c)
            setSeekTo("")
          }}
        >
          <input
            value={seekTo}
            onChange={(e) => setSeekTo(e.target.value.replace(/\D/g, ""))}
            placeholder="Go to cycle"
            aria-label="Go to cycle"
            className="tabular h-7 w-[92px] rounded-md border border-line-strong bg-surface px-2 text-[12px] text-ink"
            disabled={!replay}
          />
        </form>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm("Reset the replay? This clears all readings, predictions and work orders and returns to cycle 1,665.")) void control.reset()
          }}
          disabled={!replay}
          title="Reset replay"
          aria-label="Reset replay"
        >
          <Icon name="reset" size={13} />
        </Button>
        </>}
      </div>

      {controlError && <span className="max-w-[220px] truncate text-[12px] text-critical-text" title={controlError}>{controlError}</span>}

      <div className="grow" />

      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={onToggleTheme} title={theme.isDark ? "Light theme" : "Dark theme"} aria-label="Toggle theme">
          <Icon name={theme.isDark ? "sun" : "moon"} />
        </Button>
        {showAdvisorToggle && (
          <Button
            size="icon"
            variant={advisorOpen ? "secondary" : "ghost"}
            onClick={onToggleAdvisor}
            title={advisorOpen ? "Hide Advisor" : "Show Advisor"}
            aria-label="Toggle Advisor"
            aria-pressed={advisorOpen}
          >
            <Icon name="chat" />
          </Button>
        )}
      </div>
    </header>
  )
}
