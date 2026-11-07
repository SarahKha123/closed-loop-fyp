// /models — which cloud model answers the Advisor, and how the Advisor behaves.
// One page, no tabs: the status, the providers, then the behaviour settings.

import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { ActiveModelBanner } from "../features/models/ActiveModelBanner"
import { AdvisorSettings } from "../features/models/AdvisorSettings"
import { ProviderList } from "../features/models/ProviderList"

export const Route = createFileRoute("/models")({ component: ModelsView })

function ModelsView() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="AI model"
          subtitle="The cloud model that writes the Advisor's insights and answers its chat, and how the Advisor behaves."
        />
        <ActiveModelBanner />
      </div>

      <section aria-labelledby="providers-title" className="flex flex-col gap-2">
        <div>
          <h2 id="providers-title" className="text-lg font-semibold text-ink">
            Providers
          </h2>
          <p className="max-w-[70ch] text-sm text-ink-muted">
            Add a key for one, test it, then use it. Keys stay on the server in{" "}
            <code className="font-mono">config/cloud.json</code> and never come back to the browser. Each answer sends
            the current readings to the provider.
          </p>
        </div>
        <ProviderList />
      </section>

      <AdvisorSettings />
    </div>
  )
}
