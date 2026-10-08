// Recent condition changes across all components, newest first.

import { Link } from "@tanstack/react-router"
import { Card, CardHeader } from "../../components/ui/Card"
import { ConditionBadge } from "../../components/ui/ConditionBadge"
import { EmptyState } from "../../components/ui/EmptyState"
import { Icon } from "../../components/ui/Icon"
import type { ConditionEvent } from "../../lib/api"
import { componentByName } from "../../lib/api"
import { num } from "../../lib/format"

export function ActivityFeed({ events, className = "" }: { events: ConditionEvent[]; className?: string }) {
  return (
    <Card className={`flex min-h-0 flex-col ${className}`}>
      <CardHeader title="Activity" subtitle="Condition changes, newest first" />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {events.length === 0 ? (
          <EmptyState icon="activity" title="No changes yet">
            Every time a component moves between Optimal, Degraded and Critical it appears here.
          </EmptyState>
        ) : (
          <ol className="flex flex-col">
            {events.map((e) => {
              const key = componentByName(e.component)?.key ?? "cooler"
              return (
                <li key={`${e.cycle}-${e.component}`}>
                  <Link
                    to="/components/$component"
                    params={{ component: key }}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2"
                  >
                    <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: componentByName(e.component)?.series }} />
                    <div className="min-w-0 grow">
                      <div className="text-[12.5px] font-medium text-ink">{e.component}</div>
                      <div className="flex items-center gap-1 text-[11.5px] text-ink-faint">
                        <ConditionBadge condition={e.fromCondition} size="sm" />
                        <Icon name="arrowRight" size={11} />
                        <ConditionBadge condition={e.toCondition} size="sm" />
                      </div>
                    </div>
                    <span className="tabular shrink-0 text-[11.5px] text-ink-faint">#{num(e.cycle)}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Card>
  )
}
