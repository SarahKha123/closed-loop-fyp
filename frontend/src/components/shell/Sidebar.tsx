// Left navigation: brand, pages, the four components with their live condition, and the active model
// (not in study mode: participants don't pick models).

import { Link } from "@tanstack/react-router"
import { useLive } from "../../context/LiveContext"
import { COMPONENTS } from "../../lib/api"
import { ConditionDot } from "../ui/ConditionBadge"
import { Icon, type IconName } from "../ui/Icon"
import { ModelCard } from "./ModelCard"

const NAV: { to: "/" | "/work-orders" | "/sensors" | "/models"; label: string; icon: IconName }[] = [
  { to: "/", label: "Overview", icon: "overview" },
  { to: "/work-orders", label: "Work orders", icon: "workorder" },
  { to: "/sensors", label: "Sensors", icon: "sensor" },
  { to: "/models", label: "AI models", icon: "models" },
]

const navItem = "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
const navActive = "!bg-accent-bg !text-accent-text"

export function Sidebar({ studyMode }: { studyMode: boolean }) {
  const { overview } = useLive()
  const byName = new Map(overview?.components.map((c) => [c.component, c]))
  const openOrders = overview?.kpis.openWorkOrders ?? 0

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
          <Icon name="logo" size={17} />
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-ink">Closed Loop</div>
          <div className="text-[11px] text-ink-faint">Predictive maintenance</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 p-3" aria-label="Main">
        {NAV.filter((item) => !(studyMode && item.to === "/models")).map((item) => (
          <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} className={navItem} activeProps={{ className: navActive }}>
            <Icon name={item.icon} />
            <span className="grow">{item.label}</span>
            {item.to === "/work-orders" && openOrders > 0 && (
              <span className="tabular rounded-full bg-critical-bg px-1.5 text-[11px] font-semibold text-critical-text">{openOrders}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="px-3">
        <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Components</div>
        <div className="flex flex-col gap-0.5">
          {COMPONENTS.map((c) => {
            const state = byName.get(c.name)
            return (
              <Link
                key={c.key}
                to="/components/$component"
                params={{ component: c.key }}
                className={navItem}
                activeProps={{ className: navActive }}
              >
                <Icon name="component" />
                <span className="grow">{c.name}</span>
                {state ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <ConditionDot condition={state.condition} />
                    {state.condition}
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-faint">—</span>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grow" />

      <div className="flex flex-col gap-3 border-t border-line p-3">
        {!studyMode && <ModelCard />}
        <div className="px-1 text-[11px] text-ink-faint">FYP · Universiti Teknologi PETRONAS</div>
      </div>
    </aside>
  )
}
