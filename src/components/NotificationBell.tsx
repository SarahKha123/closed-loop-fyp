import { Link } from "@tanstack/react-router"
import { useAppState } from "../context/AppState"

export function NotificationBell() {
  const { cycle } = useAppState()
  const flagged = cycle.components.filter((c) => c.kind !== "good")
  const allClear = flagged.length === 0

  return (
    <Link
      to="/work-orders"
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[17.5px] font-medium ${
        allClear ? "border-good-text/20 bg-good-bg text-good-text" : "border-critical-text/20 bg-critical-bg text-critical-text"
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span className="truncate">
        {allClear ? "All systems normal" : `${flagged.length} ${flagged.length === 1 ? "alert" : "alerts"} — ${flagged.map((f) => f.name).join(", ")}`}
      </span>
    </Link>
  )
}
