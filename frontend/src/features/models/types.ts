// Shapes of the model-related backend responses. Field names match the
// JSON exactly — see docs/API.md for each endpoint.

/** GET /api/models/active — which cloud provider answers, and why (or why not). */
export interface ActiveModel {
  provider: string | null
  /** The provider's display name. */
  label: string | null
  /** The provider's model id. */
  tag: string | null
  resolved: boolean
  reason: string
  /** Fixed by the server's CLOUD_PROVIDER environment variable; can't be changed here. */
  managed: boolean
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
  managed: boolean
}
