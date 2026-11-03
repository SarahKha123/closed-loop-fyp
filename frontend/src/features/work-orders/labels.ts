// Display names for a work-order outcome's action and verdict (the API sends the keys).

import type { OutcomeAction, OutcomeMatch } from "../../lib/api"

export const ACTION_LABELS: Record<OutcomeAction, string> = {
  repaired: "Repaired",
  replaced: "Replaced",
  no_action: "No action needed",
  escalated: "Escalated",
}

export const MATCH_LABELS: Record<OutcomeMatch, string> = {
  yes: "Yes",
  partially: "Partially",
  no: "No",
}
