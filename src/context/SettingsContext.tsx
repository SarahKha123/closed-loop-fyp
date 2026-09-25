import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { request } from "../lib/http"

export interface OllamaModel {
  name: string
  size_bytes: number | null
  family: string | null
  parameter_size: string | null
  quantization_level: string | null
}

export interface ActiveModel {
  mode: "auto" | "pinned"
  tag: string | null
  resolved: boolean
  reason: string
  ollama_error: string | null
}

interface SettingsValue {
  models: OllamaModel[]
  modelsLoading: boolean
  modelsError: string | null
  active: ActiveModel | null
  /** The model tag the Advisor will actually use — the resolved tag, whatever the mode. */
  effectiveModel: string | null
  setModel: (tag: string) => Promise<void>
  setAuto: () => Promise<void>
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
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

  const value: SettingsValue = {
    models,
    modelsLoading,
    modelsError,
    active,
    effectiveModel: active?.tag ?? null,
    setModel,
    setAuto,
    refresh,
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}
