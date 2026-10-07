// The app shell every page renders inside: providers, sidebar, page column, Advisor panel, toasts.

import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { AdvisorPanel } from "../components/shell/AdvisorPanel"
import { Sidebar } from "../components/shell/Sidebar"
import { ToastStack } from "../components/shell/ToastStack"
import { AppStateProvider } from "../context/AppState"
import { ModelsProvider } from "../context/ModelsContext"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <ModelsProvider>
      <AppStateProvider>
        <RootShell />
      </AppStateProvider>
    </ModelsProvider>
  )
}

// Fixed to the viewport: the page itself never scrolls. A view taller than
// the window scrolls inside its own column instead.
function RootShell() {
  // The Models page gets the full width — it's a settings page, not a dashboard view.
  const onModels = useRouterState({ select: (s) => s.location.pathname.startsWith("/models") })
  return (
    <div className="flex h-screen w-full overflow-hidden bg-paper">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 grow gap-6 p-8">
        <main className="flex min-h-0 min-w-0 grow flex-col gap-[22px] overflow-y-auto">
          <Outlet />
        </main>
        {!onModels && <AdvisorPanel />}
      </div>
      <ToastStack />
    </div>
  )
}
