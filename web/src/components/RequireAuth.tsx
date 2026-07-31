import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../state/auth-context.ts'

/**
 * Route guard. Renders nothing while the session is still resolving. Without
 * that branch, a page refresh briefly redirects to /login before the token
 * check comes back, which looks like a random logout.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <p className="muted">Checking your session…</p>
  }

  if (status === 'anonymous') {
    // `from` lets the login page send the user back where they were headed.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
