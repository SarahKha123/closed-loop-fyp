import { Link } from "@tanstack/react-router"
import { dataLayer } from "../data"
import { CycleSelector } from "./CycleSelector"
import { ModelCard } from "./ModelCard"
import { NotificationBell } from "./NotificationBell"

const navItems = [
  { to: "/", label: "The Loop" },
  { to: "/work-orders", label: "Work Orders" },
  { to: "/sensors", label: "Sensor Feed" },
] as const

export function Sidebar() {
  return (
    <div className="flex h-full w-[310px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-ink/10 bg-surface px-6 py-6">
      <div className="flex items-center gap-3">
        <svg
          width="32"
          height="32"
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
          <div className="text-[22px] leading-tight font-bold">Closed Loop</div>
          <div className="mt-0.5 text-[15.5px] tracking-wide text-ink-faint uppercase">
            Predictive Maintenance
          </div>
        </div>
      </div>

      <div className="text-[18px] text-ink-muted">Reading vitals, Operator.</div>

      <NotificationBell />

      <CycleSelector />

      <div className="flex flex-col gap-1.5">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            className="w-full rounded-lg px-3.5 py-3 text-left text-[19px] font-medium text-[#3F3E3A] transition-colors"
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
        <div className="mb-2 text-[16px] font-semibold tracking-wide text-ink-faint uppercase">
          Data Layer
        </div>
        <div className="flex flex-col">
          {dataLayer.map((d) => (
            <div key={d.label} className="flex justify-between py-1.5 text-[17.5px] text-[#3F3E3A]">
              <span>{d.label}</span>
              <span className="font-mono text-[16.5px] text-ink-faint">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grow" />

      <ModelCard />

      <div className="border-t border-ink/10 pt-3.5 text-[16px] text-ink-faint">
        FYP I · Universiti Teknologi PETRONAS
      </div>
    </div>
  )
}
