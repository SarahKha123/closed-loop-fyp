// Which cloud model answers this user's chat (their own key), and which writes the
// live insights (the server's key). Shared by the sidebar's ModelCard, the Advisor
// panel and the AI model page; the backend is the source of truth, this only caches it.

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { ActiveModel } from "../features/models/types"
import { request } from "../lib/http"

interface ModelsValue {
  active: ActiveModel | null
  loading: boolean
  /** The backend itself couldn't be reached. */
  error: string | null
  selectProvider: (provider: string) => Promise<void>
  refresh: () => Promise<void>
}

const ModelsContext = createContext<ModelsValue | null>(null)

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setActive(await request<ActiveModel>("/api/models/active"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not reach the backend")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectProvider = useCallback(async (provider: string) => {
    setActive(await request<ActiveModel>("/api/models/select", { method: "POST", body: JSON.stringify({ provider }) }))
  }, [])

  return (
    <ModelsContext.Provider value={{ active, loading, error, selectProvider, refresh }}>{children}</ModelsContext.Provider>
  )
}

export function useModels() {
  const ctx = useContext(ModelsContext)
  if (!ctx) throw new Error("useModels must be used within ModelsProvider")
  return ctx
}
