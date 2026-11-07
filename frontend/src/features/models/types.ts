// Shapes of the model-related backend responses. Field names match the
// JSON exactly — see docs/API.md for each endpoint.

/** Which provider answers, and why (or why not). */
export interface ResolvedModel {
  provider: string | null
  /** The provider's display name. */
  label: string | null
  /** The provider's model id. */
  tag: string | null
  resolved: boolean
  reason: string
}

/** GET /api/models/active — the signed-in user's chat model (their own key), plus the server's model for live insights. */
export interface ActiveModel extends ResolvedModel {
  insights: ResolvedModel
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
