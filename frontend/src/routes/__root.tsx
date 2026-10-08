// The app shell every page renders inside: providers, sidebar, top bar, the page column, the Advisor, toasts.
// Fixed to the viewport — the page itself never scrolls; a tall view scrolls inside its own column.

import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router"
import { AdvisorPanel } from "../components/shell/AdvisorPanel"
import { Sidebar } from "../components/shell/Sidebar"
import { ToastStack } from "../components/shell/ToastStack"
import { TopBar } from "../components/shell/TopBar"
import { ChatProvider, useChat } from "../context/ChatContext"
import { LiveProvider } from "../context/LiveContext"
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
  // The AI models page is a settings page: it gets the full width.
  const onModels = useRouterState({ select: (s) => s.location.pathname.startsWith("/models") })

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          theme={theme}
          onToggleTheme={theme.toggle}
          advisorOpen={open}
          onToggleAdvisor={() => setOpen(!open)}
          showAdvisorToggle={!onModels}
        />
        <div className="flex min-h-0 flex-1 gap-4 p-5">
          {/* @container: page grids reflow on the column's width (it shrinks when the Advisor is open). */}
          <main className="@container min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <Outlet />
          </main>
          {!onModels && open && <AdvisorPanel onClose={() => setOpen(false)} />}
        </div>
      </div>
      <ToastStack />
    </div>
  )
}
