// The one confirmation for actions that can't be undone, in place of the browser's grey window.confirm:
// the title names the action, the body says exactly what is lost, and the button repeats the verb.
// `await confirmAction({...})` anywhere; <ConfirmHost /> (mounted once in the shell) draws it.

import { useEffect, useRef, useState } from "react"
import { Button } from "./Button"
import { Icon } from "./Icon"

type Ask = { title: string; body: string; confirmLabel: string }
type Pending = Ask & { resolve: (ok: boolean) => void }

let show: ((p: Pending) => void) | null = null

export function confirmAction(ask: Ask): Promise<boolean> {
  // ponytail: falls back to the browser dialog if the host isn't mounted (e.g. a test render).
  if (!show) return Promise.resolve(window.confirm(`${ask.title}\n\n${ask.body}`))
  return new Promise((resolve) => show!({ ...ask, resolve }))
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    show = setPending
    return () => {
      show = null
    }
  }, [])

  useEffect(() => {
    if (pending) ref.current?.showModal()
  }, [pending])

  const answer = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
    ref.current?.close()
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        answer(false)
      }}
      onClick={(e) => e.target === ref.current && answer(false)}
      aria-labelledby="confirm-title"
      className="animate-pop m-auto w-full max-w-[26rem] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/50"
    >
      {pending && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-critical-bg text-critical-text">
              <Icon name="alert" size={16} />
            </span>
            <div className="min-w-0">
              <h2 id="confirm-title" className="text-lg font-semibold">{pending.title}</h2>
              <p className="mt-1 text-base text-ink-muted">{pending.body}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {/* Cancel takes focus: Enter on a slip never destroys anything. */}
            <Button autoFocus onClick={() => answer(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => answer(true)}>{pending.confirmLabel}</Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
