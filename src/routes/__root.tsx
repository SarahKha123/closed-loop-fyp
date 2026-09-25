import { createRootRoute, Outlet } from "@tanstack/react-router"
import { AdvisorPanel } from "../components/AdvisorPanel"
import { Sidebar } from "../components/Sidebar"
import { ToastStack } from "../components/ToastStack"
import { AppStateProvider } from "../context/AppState"
import { SettingsProvider } from "../context/SettingsContext"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <SettingsProvider>
      <AppStateProvider>
        <RootShell />
      </AppStateProvider>
    </SettingsProvider>
  )
}

function RootShell() {
  return (
    <div className="min-h-screen w-full bg-paper">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 grow items-start gap-6 p-8">
          <div className="flex min-w-0 grow flex-col gap-[22px]">
            <Outlet />
          </div>
          <AdvisorPanel />
        </div>
      </div>
      <ToastStack />
    </div>
  )
}
