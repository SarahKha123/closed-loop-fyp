// Who is signed in (the demo login, /api/auth, a session cookie). The root shows the sign-in page until
// `user` is set, so everything inside the dashboard can rely on a signed-in user.

import { createContext, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../lib/api"
import type { User } from "../lib/api"
import { SIGNED_OUT_EVENT } from "../lib/http"

interface AuthValue {
  /** undefined while asking the backend, null when nobody is signed in */
  user: User | null | undefined
  /** the backend has GOOGLE_CLIENT_ID / _SECRET set */
  googleSignIn: boolean
  /** ALLOW_SIGNUP: new accounts can be created here */
  signupAllowed: boolean
  signedIn: (user: User) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [googleSignIn, setGoogleSignIn] = useState(false)
  const [signupAllowed, setSignupAllowed] = useState(false)

  useEffect(() => {
    api
      .me()
      .then((res) => {
        setUser(res.user)
        setGoogleSignIn(res.googleSignIn)
        setSignupAllowed(res.signupAllowed)
      })
      .catch(() => setUser(null))
    // The session expired or was ended elsewhere: back to the sign-in page.
    const signedOut = () => setUser(null)
    window.addEventListener(SIGNED_OUT_EVENT, signedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signedOut)
  }, [])

  async function logout() {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }

  return <AuthContext.Provider value={{ user, googleSignIn, signupAllowed, signedIn: setUser, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
