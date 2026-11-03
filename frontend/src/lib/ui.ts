// Shared Tailwind class strings for the few controls that repeat across
// pages. Plain strings, not components: there is no behaviour to share.

export const card = "rounded-xl border border-line bg-surface shadow-card"
export const input = "min-w-0 rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink"
/** A single-line control at button height (h-9): no vertical padding, so the text is centred, never clipped.
 *  Use instead of overriding `input`'s padding — Tailwind picks between conflicting classes by stylesheet order, not class order. */
export const inputCompact = "h-9 min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink"
