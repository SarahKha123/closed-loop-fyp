import { Link } from "@tanstack/react-router"
import { dataLayer } from "../data"
import { ComparisonToggle } from "./ComparisonToggle"
import { CycleSelector } from "./CycleSelector"
import { NotificationBell } from "./NotificationBell"

const navItems = [
  { to: "/", label: "The Loop" },
  { to: "/work-orders", label: "Work Orders" },
  { to: "/sensors", label: "Sensor Feed" },
] as const

export function Sidebar() {
  return (
    <div className="flex w-[260px] shrink-0 flex-col gap-[22px] border-r border-ink/10 bg-surface px-5 py-7">
      <div className="flex items-center gap-2.5">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#2A78D6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
        <div>
          <div className="text-[17px] leading-tight font-bold">Closed Loop</div>
          <div className="mt-0.5 text-[10.5px] tracking-wide text-ink-faint uppercase">
            Predictive Maintenance
          </div>
        </div>
      </div>

      <div className="text-[13px] text-ink-muted">Reading vitals, Operator.</div>

      <NotificationBell />

      <CycleSelector />

      <div className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            className="w-full rounded-lg px-3 py-2.5 text-left text-[14px] font-medium text-[#3F3E3A] transition-colors"
            activeProps={{
              className: "!bg-accent-bg !text-accent-text !font-semibold",
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="h-px bg-ink/10" />

      <div>
        <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
          Data Layer
        </div>
        <div className="flex flex-col">
          {dataLayer.map((d) => (
            <div key={d.label} className="flex justify-between py-1.5 text-[12.5px] text-[#3F3E3A]">
              <span>{d.label}</span>
              <span className="font-mono text-[11.5px] text-ink-faint">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grow" />

      <ComparisonToggle />

      <div className="border-t border-ink/10 pt-3.5 text-[11px] text-ink-faint">
        FYP I · Universiti Teknologi PETRONAS
      </div>
    </div>
  )
}
