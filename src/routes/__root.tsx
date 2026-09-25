import { createRootRoute, Outlet } from "@tanstack/react-router"
import { AdvisorPanel } from "../components/AdvisorPanel"
import { OldWayPanel } from "../components/OldWayPanel"
import { Sidebar } from "../components/Sidebar"
import { ToastStack } from "../components/ToastStack"
import { AppStateProvider, useAppState } from "../context/AppState"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AppStateProvider>
      <RootShell />
    </AppStateProvider>
  )
}

function RootShell() {
  const { showComparison } = useAppState()

  return (
    <div className="min-h-screen w-full bg-paper">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 grow items-start gap-6 p-8">
          <div className="flex min-w-0 grow gap-6">
            {showComparison && <OldWayPanel />}
            <div className="flex min-w-0 grow flex-col gap-[22px]">
              {showComparison && (
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-accent-bg px-3 py-1 text-[12px] font-semibold text-accent-text">
                  New Way — Closed Loop
                </div>
              )}
              <Outlet />
            </div>
          </div>
          <AdvisorPanel />
        </div>
      </div>
      <ToastStack />
    </div>
  )
}
