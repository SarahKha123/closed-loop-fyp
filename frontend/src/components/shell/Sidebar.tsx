// Left navigation: the product, its pages, the four components with their live condition, the active model
// (not in study mode: participants don't pick models) and the operator's profile menu.
// Below 1024px it folds to a 56px rail: icons with tooltips, labels kept for screen readers.
// The current page is marked the data-terminal way: ink label, one accent underline exactly as wide as the label.

import { Link } from "@tanstack/react-router"
import { useAuth } from "../../context/AuthContext"
import { useLive } from "../../context/LiveContext"
import { usePendingCount } from "../../features/admin/usePendingCount"
import { COMPONENTS } from "../../lib/api"
import { conditionStyle } from "../../lib/status"
import { Icon, Mark, type IconName } from "../ui/Icon"
import type { useTheme } from "../../lib/theme"
import { ModelCard } from "./ModelCard"
import { ProfileMenu } from "./ProfileMenu"

const NAV: { to: "/" | "/work-orders" | "/sensors" | "/models" | "/admin"; label: string; icon: IconName }[] = [
  { to: "/", label: "Overview", icon: "overview" },
  { to: "/work-orders", label: "Work orders", icon: "workorder" },
  { to: "/sensors", label: "Sensors", icon: "sensor" },
  { to: "/models", label: "AI model", icon: "models" },
  { to: "/admin", label: "Admin", icon: "shield" },
]

const navItem =
  "group relative flex h-9 items-center gap-3 rounded-md px-3 text-base text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink max-lg:justify-center max-lg:px-0"
const navActive = "!text-ink [&_.nav-label]:underline [&_.nav-label]:decoration-accent [&_.nav-label]:decoration-1 [&_.nav-label]:underline-offset-[7px]"
const label = "nav-label grow truncate max-lg:sr-only"

export function Sidebar({ studyMode, theme }: { studyMode: boolean; theme: ReturnType<typeof useTheme> }) {
  const { overview } = useLive()
  const byName = new Map(overview?.components.map((c) => [c.component, c]))
  const openOrders = overview?.kpis.openWorkOrders ?? 0
  const admin = useAuth().user?.role === "admin"
  const pending = usePendingCount()

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col border-r border-line bg-canvas lg:w-[232px]">
      <div className="flex h-14 items-center gap-2.5 px-4 max-lg:justify-center max-lg:px-0">
        <Mark size={22} />
        <div className="leading-tight max-lg:sr-only">
          <div className="text-base font-semibold text-ink">Closed Loop</div>
          <div className="text-xs text-ink-faint">Hydraulic test rig</div>
        </div>
      </div>

      <nav className="flex flex-col gap-px px-2 pt-2" aria-label="Main">
        {NAV.filter((item) => !(studyMode && (item.to === "/models" || item.to === "/admin")) && (admin || item.to !== "/admin")).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            title={item.label}
            data-tour={item.to === "/work-orders" ? "work-orders" : undefined}
            activeOptions={{ exact: item.to === "/" }}
            className={navItem}
            activeProps={{ className: navActive }}
          >
            <Icon name={item.icon} />
            <span className={label}>{item.label}</span>
            {item.to === "/work-orders" && openOrders > 0 && (
              <span
                className="tabular text-sm font-medium text-critical-text max-lg:absolute max-lg:top-0.5 max-lg:right-1.5 max-lg:text-xs"
                aria-label={`${openOrders} open`}
              >
                {openOrders}
              </span>
            )}
            {item.to === "/admin" && pending > 0 && (
              <span
                className="tabular text-sm font-medium text-warning-text max-lg:absolute max-lg:top-0.5 max-lg:right-1.5 max-lg:text-xs"
                aria-label={`${pending} ${pending === 1 ? "account" : "accounts"} waiting for approval`}
              >
                {pending}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="px-2 pt-5" data-tour="components">
        <div className="px-3 pb-1.5 text-sm text-ink-faint max-lg:sr-only">Components</div>
        <div className="flex flex-col gap-px">
          {COMPONENTS.map((c) => {
            const state = byName.get(c.name)
            const s = state && conditionStyle[state.condition]
            return (
              <Link
                key={c.key}
                to="/components/$component"
                params={{ component: c.key }}
                title={state ? `${c.name}: ${state.condition}` : c.name}
                className={navItem}
                activeProps={{ className: navActive }}
              >
                <span className="relative flex">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.series }} />
                  {/* Rail: the condition rides on the component's swatch. */}
                  {s && state.condition !== "Optimal" && (
                    <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ring-2 ring-canvas lg:hidden ${s.dot}`} />
                  )}
                </span>
                <span className={label}>{c.name}</span>
                {s ? (
                  <span className={`inline-flex items-center gap-1 text-sm max-lg:hidden ${state.condition === "Optimal" ? "text-ink-faint" : s.text}`}>
                    <Icon name={s.icon} size={13} />
                    {state.condition}
                  </span>
                ) : (
                  <span className="text-sm text-ink-faint max-lg:hidden">—</span>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grow" />

      <div className="flex flex-col gap-2 border-t border-line p-2">
        {!studyMode && (
          <div className="max-lg:hidden">
            <ModelCard />
          </div>
        )}
        <ProfileMenu studyMode={studyMode} theme={theme} />
      </div>
    </aside>
  )
}
