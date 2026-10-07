// Shapes of the model-related backend responses. Field names match the
// JSON exactly — see docs/API.md for each endpoint.

export interface OllamaModel {
  name: string
  size_bytes: number | null
  family: string | null
  parameter_size: string | null
  quantization_level: string | null
  embedding?: boolean
}

export interface ActiveModel {
  mode: "auto" | "pinned" | "cloud"
  tag: string | null
  provider?: string | null
  resolved: boolean
  reason: string
  ollama_error: string | null
}

/** GET /api/models/catalogue — a suggested model to download. */
export interface CatalogueModel {
  tag: string
  label: string
  vendor: string
  params_b: number
  est_size_bytes: number
  note: string
  installed: boolean
  fits: boolean | null
}

/** GET /api/cloud — one provider's settings. Never includes the key itself. */
export interface CloudProvider {
  id: string
  label: string
  docs: string
  default_base_url: string
  base_url: string
  model: string
  has_key: boolean
  key_hint: string | null
  ready: boolean
}

/** POST /api/models/pull — one SSE progress frame. */
export type PullEvent = { status: string; percent: number | null; done: boolean } | { error: string }
