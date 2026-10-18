// The app shell every page renders inside: providers, sidebar, top bar, the page column, the Advisor, toasts, the no-model prompt.
// Fixed to the viewport — the page itself never scrolls; a tall view scrolls inside its own column.
// In study mode participants can't change the setup (no models page, model card or replay controls),
// and the study condition decides the Advisor: hidden (dashboard only) or always open (dashboard + AI).

import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router"
import { AdvisorPanel } from "../components/shell/AdvisorPanel"
import { NoModelDialog } from "../components/shell/NoModelDialog"
import { Sidebar } from "../components/shell/Sidebar"
import { ToastStack } from "../components/shell/ToastStack"
import { TopBar } from "../components/shell/TopBar"
import { ChatProvider, useChat } from "../context/ChatContext"
import { LiveProvider, useLive } from "../context/LiveContext"
import { ModelsProvider } from "../context/ModelsContext"
import { useTheme } from "../lib/theme"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <ModelsProvider>
      <LiveProvider>
        <ChatProvider>
          <Shell />
        </ChatProvider>
      </LiveProvider>
    </ModelsProvider>
  )
}

function Shell() {
  const theme = useTheme()
  const { open, setOpen } = useChat()
  const study = useLive().settings?.study
  const studyMode = study?.enabled ?? false
  // The AI models page and the researcher's study page are settings pages: they get the full width.
  const fullWidth = useRouterState({ select: (s) => /^\/(models|study)/.test(s.location.pathname) })
  const advisor = fullWidth ? "none" : !studyMode ? (open ? "open" : "closed") : study?.condition === "dashboard_ai" ? "pinned" : "none"

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      <Sidebar studyMode={studyMode} theme={theme} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          theme={theme}
          onToggleTheme={theme.toggle}
          advisorOpen={open}
          onToggleAdvisor={() => setOpen(!open)}
          showAdvisorToggle={advisor === "open" || advisor === "closed"}
          studyMode={studyMode}
        />
        <div className="flex min-h-0 flex-1 gap-5 p-6">
          {/* @container: page grids reflow on the column's width (it shrinks when the Advisor is open). */}
          {/* relative: toasts anchor to this column's corner, clear of the Advisor's composer. */}
          <div className="relative min-h-0 min-w-0 flex-1">
            <main className="@container h-full overflow-x-hidden overflow-y-auto">
              <Outlet />
            </main>
            <ToastStack />
          </div>
          {(advisor === "open" || advisor === "pinned") && <AdvisorPanel onClose={advisor === "open" ? () => setOpen(false) : undefined} />}
        </div>
      </div>
      <NoModelDialog studyMode={studyMode} />
    </div>
  )
}
