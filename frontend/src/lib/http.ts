// The shared fetch wrapper for talking to the Closed Loop backend.
//
// Same shape as Daedalus's frontend/src/lib/http.ts: one `request` for plain
// JSON calls, one `streamEvents` for the server-sent-event ones (here, just
// chat) — so a fix to how an error body is read, or how an SSE frame can
// split across two chunks, only has to happen once.

const REQUEST_TIMEOUT_MS = 15000
const UNREACHABLE = "could not reach the backend"

/** 502/504 come from the dev proxy when the backend isn't running: say that, not "HTTP 502". */
const statusText = (status: number) => (status === 502 || status === 504 ? UNREACHABLE : `HTTP ${status}`)

export interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

export async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), init?.timeoutMs ?? REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      signal: controller.signal,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    })
  } catch (err) {
    throw new Error(
      err instanceof Error && err.name === "AbortError"
        ? "the backend did not respond in time"
        : UNREACHABLE,
    )
  } finally {
    window.clearTimeout(timer)
  }

  if (!res.ok) {
    let detail = statusText(res.status)
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === "string") detail = body.detail
    } catch {
      /* non-JSON error body — the status is the message */
    }
    throw new Error(detail)
  }

  try {
    return (await res.json()) as T
  } catch {
    throw new Error("the backend returned an unexpected response")
  }
}

// ── server-sent events ───────────────────────────────────────────────────────

export interface EventStream {
  done: Promise<void>
  cancel: () => void
}

/** POST JSON, then read an SSE response frame by frame. No timeout — a long answer is minutes of a healthy connection. */
export function streamEvents<E>(path: string, body: unknown, onEvent: (event: E) => void): EventStream {
  const controller = new AbortController()

  const done = (async () => {
    const res = await fetch(path, {
      method: "POST",
      body: JSON.stringify(body),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(res.status === 502 || res.status === 504 ? UNREACHABLE : `HTTP ${res.status}: ${await res.text()}`)
    if (!res.body) throw new Error("the backend sent no response body")

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      for (;;) {
        const { value, done: finished } = await reader.read()
        if (finished) break
        buffer += decoder.decode(value, { stream: true })

        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "))
          if (!line) continue
          let event: E
          try {
            event = JSON.parse(line.slice(6)) as E
          } catch {
            continue
          }
          onEvent(event)
        }
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
  })()

  return { done, cancel: () => controller.abort() }
}
