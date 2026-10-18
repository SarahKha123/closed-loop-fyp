// Left navigation: brand, pages, the four components with their live condition, the active model
// (not in study mode: participants don't pick models) and the operator's profile menu.

import { Link } from "@tanstack/react-router"
import { useLive } from "../../context/LiveContext"
import { COMPONENTS } from "../../lib/api"
import { ConditionDot } from "../ui/ConditionBadge"
import { Icon, type IconName } from "../ui/Icon"
import type { useTheme } from "../../lib/theme"
import { ModelCard } from "./ModelCard"
import { ProfileMenu } from "./ProfileMenu"

const NAV: { to: "/" | "/work-orders" | "/sensors" | "/models"; label: string; icon: IconName }[] = [
  { to: "/", label: "Overview", icon: "overview" },
  { to: "/work-orders", label: "Work orders", icon: "workorder" },
  { to: "/sensors", label: "Sensors", icon: "sensor" },
  { to: "/models", label: "AI models", icon: "models" },
]

const navItem = "flex h-10 items-center gap-3 rounded-lg px-3 text-base font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
const navActive = "!bg-accent-bg !text-accent-text"

export function Sidebar({ studyMode, theme }: { studyMode: boolean; theme: ReturnType<typeof useTheme> }) {
  const { overview } = useLive()
  const byName = new Map(overview?.components.map((c) => [c.component, c]))
  const openOrders = overview?.kpis.openWorkOrders ?? 0

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-16 items-center gap-3 border-b border-line px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
          <Icon name="logo" size={17} />
        </div>
        <div className="leading-tight">
          <div className="text-lg font-semibold text-ink">Closed Loop</div>
          <div className="text-xs text-ink-faint">Predictive maintenance</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 p-3" aria-label="Main">
        {NAV.filter((item) => !(studyMode && item.to === "/models")).map((item) => (
          <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} className={navItem} activeProps={{ className: navActive }}>
            <Icon name={item.icon} />
            <span className="grow">{item.label}</span>
            {item.to === "/work-orders" && openOrders > 0 && (
              <span className="tabular rounded-full bg-critical-bg px-2 text-xs font-semibold text-critical-text">{openOrders}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="px-3">
        <div className="px-3 pt-3 pb-2 text-sm font-semibold text-ink-muted">Components</div>
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
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
                    <ConditionDot condition={state.condition} />
                    {state.condition}
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">—</span>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grow" />

      <div className="flex flex-col gap-3 border-t border-line p-3">
        {!studyMode && <ModelCard />}
        <ProfileMenu studyMode={studyMode} theme={theme} />
      </div>
    </aside>
  )
}
