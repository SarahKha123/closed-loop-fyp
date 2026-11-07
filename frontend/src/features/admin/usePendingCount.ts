// How many accounts wait for approval: the admin's sidebar badge and the Users tab. Admins only; it follows
// the `accounts` events the backend sends on every sign-up and admin action.

import { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../lib/api"
import { subscribe } from "../../lib/stream"

export function usePendingCount(): number {
  const admin = useAuth().user?.role === "admin"
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!admin) return
    api.admin.users().then((r) => setCount(r.pendingCount)).catch(() => {})
    return subscribe((e) => {
      if (e.type === "accounts") setCount(e.pending)
      else if (e.type === "reconnected") api.admin.users().then((r) => setCount(r.pendingCount)).catch(() => {})
    })
  }, [admin])
  return admin ? count : 0
}
