// Which models are installed and which one the Advisor is using. Shared by
// the sidebar's ModelCard and the Models page; the backend is the source of
// truth (config/model_config.json), this only caches what it last said.

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { ActiveModel, OllamaModel } from "../features/models/types"
import { request } from "../lib/http"

interface ModelsValue {
  models: OllamaModel[]
  modelsLoading: boolean
  modelsError: string | null
  active: ActiveModel | null
  setModel: (tag: string) => Promise<void>
  setAuto: () => Promise<void>
  setCloud: (provider: string) => Promise<void>
  refresh: () => Promise<void>
}

const ModelsContext = createContext<ModelsValue | null>(null)

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [active, setActive] = useState<ActiveModel | null>(null)

  const refresh = useCallback(async () => {
    setModelsLoading(true)
    try {
      const [modelsRes, activeRes] = await Promise.all([
        request<{ models: OllamaModel[]; error: string | null }>("/api/models"),
        request<ActiveModel>("/api/models/active"),
      ])
      setModels(modelsRes.models)
      setModelsError(modelsRes.error)
      setActive(activeRes)
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : "could not reach the backend")
    } finally {
      setModelsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setModel = useCallback(async (tag: string) => {
    const result = await request<ActiveModel>("/api/models/select", {
      method: "POST",
      body: JSON.stringify({ mode: "pinned", tag }),
    })
    setActive(result)
  }, [])

  const setAuto = useCallback(async () => {
    const result = await request<ActiveModel>("/api/models/select", {
      method: "POST",
      body: JSON.stringify({ mode: "auto" }),
    })
    setActive(result)
  }, [])

  const setCloud = useCallback(async (provider: string) => {
    const result = await request<ActiveModel>("/api/models/select", {
      method: "POST",
      body: JSON.stringify({ mode: "cloud", provider }),
    })
    setActive(result)
  }, [])

  const value: ModelsValue = {
    models,
    modelsLoading,
    modelsError,
    active,
    setModel,
    setAuto,
    setCloud,
    refresh,
  }

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>
}

export function useModels() {
  const ctx = useContext(ModelsContext)
  if (!ctx) throw new Error("useModels must be used within ModelsProvider")
  return ctx
}
