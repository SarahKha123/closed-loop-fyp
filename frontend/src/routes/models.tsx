// /models — choose, download and configure the Advisor's model. Each tab is a
// component in features/models/; this file is only the page frame and tabs.

import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/ui/Button"
import { useModels } from "../context/ModelsContext"
import { ActiveModelBanner } from "../features/models/ActiveModelBanner"
import { CloudTab } from "../features/models/CloudTab"
import { HardwareTab } from "../features/models/HardwareTab"
import { LocalModelsTab } from "../features/models/LocalModelsTab"
import { SettingsTab } from "../features/models/SettingsTab"

type Tab = "installed" | "download" | "cloud" | "hardware" | "settings"

export const Route = createFileRoute("/models")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: ["download", "cloud", "hardware", "settings"].includes(search.tab as string) ? (search.tab as Tab) : undefined,
  }),
  component: ModelsView,
})

function ModelsView() {
  const { tab = "installed" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { active, setAuto } = useModels()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="AI models"
        subtitle="Choose what answers in the Advisor — a local model through Ollama, or a cloud API — and how it behaves"
      />

      <ActiveModelBanner />

      <div data-tour="tabs" role="tablist" aria-label="Model settings" className="flex items-center gap-1 border-b border-line">
        {(["installed", "download", "cloud", "hardware", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => navigate({ search: { tab: t === "installed" ? undefined : t } })}
            className={`-mb-px border-b px-3 py-2.5 text-base font-medium transition-colors ${
              tab === t ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {{ installed: "Installed", download: "Download", cloud: "Cloud APIs", hardware: "Hardware", settings: "Settings" }[t]}
          </button>
        ))}
        <div className="grow" />
        {active && active.mode !== "auto" && (
          <Button onClick={() => void setAuto()}>
            Switch to Auto
          </Button>
        )}
      </div>

      {/* One LocalModelsTab for both views, so a download keeps going while you look at Installed. */}
      {(tab === "installed" || tab === "download") && (
        <LocalModelsTab view={tab} onDownloadTab={() => navigate({ search: { tab: "download" } })} />
      )}
      {tab === "cloud" && <CloudTab />}
      {tab === "hardware" && <HardwareTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  )
}
