// Signed out, the sign-in page (AuthScreen) is the only screen; waiting for approval, PendingScreen. Signed in, the app shell every page renders inside: providers, sidebar, top bar, the page column, the Advisor, the no-model prompt.
// Fixed to the viewport — the page itself never scrolls; a tall view scrolls inside its own column.
// In study mode participants can't change the setup (no models page, model card or replay controls),
// and the study condition decides the Advisor: hidden (dashboard only) or always open (dashboard + AI).

import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router"
import { AdvisorPanel } from "../components/shell/AdvisorPanel"
import { NoModelDialog } from "../components/shell/NoModelDialog"
import { Sidebar } from "../components/shell/Sidebar"
import { Tour } from "../components/shell/Tour"
import { TopBar } from "../components/shell/TopBar"
import { ConfirmHost } from "../components/ui/ConfirmDialog"
import { AuthProvider, useAuth } from "../context/AuthContext"
import { ChatProvider, useChat } from "../context/ChatContext"
import { LiveProvider, useLive } from "../context/LiveContext"
import { ModelsProvider } from "../context/ModelsContext"
import { AuthScreen } from "../features/auth/AuthScreen"
import { PendingScreen } from "../features/auth/PendingScreen"
import { useTheme } from "../lib/theme"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/** The dashboard (and its live stream) only mounts once an active account is signed in. */
function Gate() {
  const { user } = useAuth()
  const theme = useTheme() // here, not in Shell, so the sign-in page has the saved theme too
  if (user === undefined) return <div className="h-screen bg-canvas" /> // still asking the backend
  if (user === null) return <AuthScreen />
  if (user.status !== "active") return <PendingScreen user={user} />
  return (
    <ModelsProvider>
      <LiveProvider>
        <ChatProvider>
          <Shell theme={theme} />
        </ChatProvider>
      </LiveProvider>
    </ModelsProvider>
  )
}

function Shell({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const { open, setOpen } = useChat()
  const study = useLive().settings?.study
  const studyMode = study?.enabled ?? false
  // The AI model, Admin and study pages are settings pages: they get the full width.
  const path = useRouterState({ select: (s) => s.location.pathname })
  const fullWidth = useRouterState({ select: (s) => /^\/(models|study|admin)/.test(s.location.pathname) })
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
        <div className="relative flex min-h-0 flex-1 gap-5 p-5">
          {/* @container: page grids reflow on the column's width (it shrinks when the Advisor is open). */}
          <div className="min-h-0 min-w-0 flex-1">
            <main className="@container h-full overflow-x-hidden overflow-y-auto">
              <div key={path} className="animate-page-in h-full">
                <Outlet />
              </div>
            </main>
          </div>
          {(advisor === "open" || advisor === "pinned") && <AdvisorPanel onClose={advisor === "open" ? () => setOpen(false) : undefined} />}
        </div>
      </div>
      <NoModelDialog studyMode={studyMode} />
      <Tour studyMode={studyMode} />
      <ConfirmHost />
    </div>
  )
}
