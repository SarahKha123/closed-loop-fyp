// /admin — what only an admin does: approve and manage accounts, and the server settings that used to be
// .env (the Gmail sender, Google sign-in). One view per area, picked by ?view= (Users by default), so each
// opens on its own question. The API refuses non-admins too; this page just says so.

import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../components/PageHeader"
import { EmptyState } from "../components/ui/EmptyState"
import { useAuth } from "../context/AuthContext"
import { EmailView, GoogleView } from "../features/admin/ServerSettings"
import { UsersView } from "../features/admin/UsersView"
import { usePendingCount } from "../features/admin/usePendingCount"

type View = "users" | "email" | "google"

const VIEWS: { id: View; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "email", label: "Email" },
  { id: "google", label: "Google sign-in" },
]

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): { view?: Exclude<View, "users"> } => ({
    view: search.view === "email" || search.view === "google" ? search.view : undefined,
  }),
  component: AdminPage,
})

function AdminPage() {
  const { user } = useAuth()
  const { view = "users" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const pending = usePendingCount()

  if (user?.role !== "admin") {
    return (
      <EmptyState icon="shield" title="Admins only">
        Ask an admin if you need an account approved or a setting changed.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Admin" subtitle="Who can use the dashboard, and how it sends email and signs people in." />

      <div role="tablist" aria-label="Admin" className="flex items-center gap-1 border-b border-line">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => void navigate({ search: { view: v.id === "users" ? undefined : v.id } })}
            className={`-mb-px inline-flex items-center gap-2 border-b px-3 py-2.5 text-base font-medium transition-colors ${
              view === v.id ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {v.label}
            {v.id === "users" && pending > 0 && (
              <span className="tabular rounded-full bg-warning-bg px-1.5 text-sm text-warning-text" aria-label={`${pending} waiting`}>
                {pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "email" ? <EmailView /> : view === "google" ? <GoogleView /> : <UsersView />}
    </div>
  )
}
