// The bar above every page: whether the feed is live, the replay controls, live notices, theme and Advisor toggles.
// In study mode the researcher drives the replay, so participants see the position but no controls.

import { useState } from "react"
import { useLive } from "../../context/LiveContext"
import { num } from "../../lib/format"
import type { Theme } from "../../lib/theme"
import { Button } from "../ui/Button"
import { confirmAction } from "../ui/ConfirmDialog"
import { Icon } from "../ui/Icon"
import { ToastStack } from "./ToastStack"
import { TOUR_EVENT } from "./Tour"

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
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-canvas px-5">
      <div data-tour="replay" className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pr-1 pl-3">
        <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${statusStyle.tone}`}>
          <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
          {statusStyle.text}
        </span>
        <span className="h-4 w-px bg-line-strong" />
        <div className="flex flex-col justify-center" title="Replay position">
          <span className="tabular text-sm text-ink">
            Cycle <b className="font-semibold">{num(replay?.cycle ?? null)}</b>
            <span className="text-ink-faint"> / {num(replay?.total ?? 2205)}</span>
          </span>
          <span className="mt-0.5 h-1 w-[140px] overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </span>
        </div>
        {!studyMode && <>
        <span className="h-4 w-px bg-line-strong" />
        {replay?.state === "playing" ? (
          <Button size="sm" variant="primary" onClick={() => void control.pause()} aria-label="Pause replay">
            <Icon name="pause" size={14} /> Pause
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => void control.play()} disabled={!replay || replay.state === "finished"} aria-label="Play replay">
            <Icon name="play" size={14} /> Play
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void control.step()} disabled={!replay || replay.state !== "paused"} title="Step one cycle" aria-label="Step one cycle">
          <Icon name="step" size={14} />
        </Button>
        <label className="sr-only" htmlFor="replay-speed">
          Seconds per cycle
        </label>
        <select
          id="replay-speed"
          value={replay?.secondsPerCycle ?? 2}
          onChange={(e) => void control.speed(Number(e.target.value))}
          disabled={!replay}
          className="h-8 rounded-md border border-line-strong bg-surface px-1.5 text-sm text-ink"
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
          className="flex items-center max-xl:hidden"
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
            className="tabular h-8 w-[120px] rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
            disabled={!replay}
          />
        </form>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const ok = await confirmAction({
              title: "Reset the replay?",
              body: "This clears every reading, prediction and work order and returns to cycle 1,665. It can't be undone.",
              confirmLabel: "Reset replay",
            })
            if (ok) void control.reset()
          }}
          disabled={!replay}
          title="Reset replay"
          aria-label="Reset replay"
        >
          <Icon name="reset" size={14} />
        </Button>
        </>}
      </div>

      {controlError && <span className="max-w-[260px] truncate text-sm text-critical-text" title={controlError}>{controlError}</span>}

      <div className="min-w-0 grow">
        <ToastStack />
      </div>

      <div className="flex items-center gap-1">
        {!studyMode && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
            title="Guide to this page"
            aria-label="Guide to this page"
            data-tour="help"
          >
            <Icon name="help" />
          </Button>
        )}
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
            data-tour="advisor"
            aria-pressed={advisorOpen}
          >
            <Icon name="chat" />
          </Button>
        )}
      </div>
    </header>
  )
}
