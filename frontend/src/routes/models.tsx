// /models — choose, download and configure the Advisor's model. Each tab is a
// component in features/models/; this file is only the page frame and tabs.

import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { useModels } from "../context/ModelsContext"
import { ActiveModelBanner } from "../features/models/ActiveModelBanner"
import { CloudTab } from "../features/models/CloudTab"
import { HardwareTab } from "../features/models/HardwareTab"
import { LocalModelsTab } from "../features/models/LocalModelsTab"
import { btn } from "../lib/ui"

type Tab = "installed" | "download" | "cloud" | "hardware"

export const Route = createFileRoute("/models")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: ["download", "cloud", "hardware"].includes(search.tab as string) ? (search.tab as Tab) : undefined,
  }),
  component: ModelsView,
})

function ModelsView() {
  const { tab = "installed" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { active, setAuto } = useModels()

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title="Models"
        subtitle="Choose what answers in the Advisor: a local model through Ollama, or a cloud API"
      />

      <ActiveModelBanner />

      <div className="flex items-center gap-1 border-b border-line">
        {(["installed", "download", "cloud", "hardware"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => navigate({ search: { tab: t === "installed" ? undefined : t } })}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium transition-colors ${
              tab === t ? "border-accent text-accent-text" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {{ installed: "Installed", download: "Download", cloud: "Cloud APIs", hardware: "Hardware" }[t]}
          </button>
        ))}
        <div className="grow" />
        {active?.mode !== "auto" && (
          <button type="button" className={btn} onClick={() => void setAuto()}>
            Switch to Auto
          </button>
        )}
      </div>

      {/* One LocalModelsTab for both views, so a download keeps going while you look at Installed. */}
      {(tab === "installed" || tab === "download") && (
        <LocalModelsTab view={tab} onDownloadTab={() => navigate({ search: { tab: "download" } })} />
      )}
      {tab === "cloud" && <CloudTab />}
      {tab === "hardware" && <HardwareTab />}
    </div>
  )
}
