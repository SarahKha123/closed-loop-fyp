// Who is signed in (/api/auth, a session cookie). The root shows the sign-in page until `user` is set, and
// the waiting screen while it is pending, so everything inside the dashboard can rely on an active user.
// On load the backend may be asleep (Render's free plan) or down: `user` stays undefined while it is retried,
// and the root shows "waking the server" instead of dropping everyone on the sign-in page.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../lib/api"
import type { User } from "../lib/api"
import { SIGNED_OUT_EVENT, UnreachableError } from "../lib/http"

const RETRY_MS = 5_000 // between tries while the backend is unreachable
const GIVE_UP_MS = 180_000 // a free-plan wake-up takes about a minute; well past that, it's down

interface AuthValue {
  /** undefined while asking the backend, null when nobody is signed in */
  user: User | null | undefined
  /** the backend didn't answer within GIVE_UP_MS of loading (user stays undefined) */
  serverDown: boolean
  /** start the load-time retries again, after serverDown */
  retry: () => void
  /** an admin has set Google sign-in up */
  googleSignIn: boolean
  /** an admin has set the Gmail sender up, so emails can go out */
  emailSetUp: boolean
  /** a sign-in, or the user's own settings changed */
  signedIn: (user: User) => void
  /** ask the backend again (e.g. a pending user checking whether they were approved) */
  reload: () => Promise<void>
  /** why the sign-in page is showing, when it wasn't the person's own doing (a rejected request) */
  notice: string | null
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [googleSignIn, setGoogleSignIn] = useState(false)
  const [emailSetUp, setEmailSetUp] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [serverDown, setServerDown] = useState(false)
  const attempt = useRef(0) // bumped by each connect() and on unmount, so a superseded retry loop stops
  const waiting = useRef(false) // the signed-in account was pending at the last check

  const apply = useCallback((res: Awaited<ReturnType<typeof api.me>>) => {
    // A pending account whose session vanished was rejected (rejecting ends its sessions): say so, rather
    // than dropping them on the sign-in page without a word.
    if (waiting.current && !res.user) setNotice("Your account wasn't approved. Ask an administrator if you think that's a mistake.")
    waiting.current = res.user?.status === "pending"
    setUser(res.user)
    setGoogleSignIn(res.googleSignIn)
    setEmailSetUp(res.emailSetUp)
  }, [])

  const reload = useCallback(async () => {
    try {
      apply(await api.me())
    } catch {
      setUser(null)
    }
  }, [apply])

  /** The first ask: retried while the backend is unreachable; any real answer (even an error) ends it. */
  const connect = useCallback(async () => {
    const mine = ++attempt.current
    const start = Date.now()
    while (attempt.current === mine) {
      try {
        const res = await api.me()
        if (attempt.current === mine) apply(res)
        return
      } catch (err) {
        if (attempt.current !== mine) return
        if (!(err instanceof UnreachableError)) return setUser(null)
        if (Date.now() - start > GIVE_UP_MS) return setServerDown(true)
        await new Promise((r) => window.setTimeout(r, RETRY_MS))
      }
    }
  }, [apply])

  useEffect(() => {
    const attempts = attempt
    void connect()
    // The session expired or was ended elsewhere: back to the sign-in page.
    const signedOut = () => setUser(null)
    window.addEventListener(SIGNED_OUT_EVENT, signedOut)
    return () => {
      attempts.current++ // stop the retry loop
      window.removeEventListener(SIGNED_OUT_EVENT, signedOut)
    }
  }, [connect])

  async function logout() {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }

  return <AuthContext.Provider value={{ user, serverDown, retry: () => {
      setServerDown(false)
      void connect()
    }, googleSignIn, emailSetUp, signedIn: setUser, reload, notice, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
