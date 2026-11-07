// Who is signed in (/api/auth, a session cookie). The root shows the sign-in page until `user` is set, and
// the waiting screen while it is pending, so everything inside the dashboard can rely on an active user.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../lib/api"
import type { User } from "../lib/api"
import { SIGNED_OUT_EVENT } from "../lib/http"

interface AuthValue {
  /** undefined while asking the backend, null when nobody is signed in */
  user: User | null | undefined
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
  const waiting = useRef(false) // the signed-in account was pending at the last check

  const reload = useCallback(async () => {
    try {
      const res = await api.me()
      // A pending account whose session vanished was rejected (rejecting ends its sessions): say so, rather
      // than dropping them on the sign-in page without a word.
      if (waiting.current && !res.user) setNotice("Your account wasn't approved. Ask an administrator if you think that's a mistake.")
      waiting.current = res.user?.status === "pending"
      setUser(res.user)
      setGoogleSignIn(res.googleSignIn)
      setEmailSetUp(res.emailSetUp)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    void reload()
    // The session expired or was ended elsewhere: back to the sign-in page.
    const signedOut = () => setUser(null)
    window.addEventListener(SIGNED_OUT_EVENT, signedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signedOut)
  }, [reload])

  async function logout() {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }

  return <AuthContext.Provider value={{ user, googleSignIn, emailSetUp, signedIn: setUser, reload, notice, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
