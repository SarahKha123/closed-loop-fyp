// Inline stroke icons (Lucide-style paths, 24×24 grid). One component, no icon library.

const PATHS = {
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  component: "M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10",
  workorder: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 13l2 2 4-4",
  sensor: "M2 12h4l3-8 4 16 3-8h6",
  models: "M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4zM10 11h.01M14 11h.01",
  play: "M7 4v16l13-8z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  step: "M5 4v16l10-8zM17 4h2v16h-2z",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  check: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  octagon: "M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9zM15 9l-6 6M9 9l6 6",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  close: "M18 6 6 18M6 6l12 12",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  table: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18",
  chart: "M3 3v18h18M7 14l4-4 4 4 5-6",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chevronUpDown: "M7 15l5 5 5-5M7 9l5-5 5 5",
  monitor: "M2 3h20v14H2zM8 21h8M12 17v4",
  logo: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  const filled = name === "play" || name === "pause" || name === "step"
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
