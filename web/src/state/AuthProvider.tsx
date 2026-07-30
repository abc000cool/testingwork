import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { api } from '../lib/api.ts'
import { onUnauthorized } from '../lib/http.ts'
import { clearToken, initToken, setToken } from '../lib/token.ts'
import type { Me, UserProfile } from '../types/contracts.ts'
import type { LoginRequest, ProfileUpdate, SignupRequest } from '../types/wire.ts'
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context.ts'

/**
 * Owns the session: the bearer token, the cached `Me`, and the transitions
 * between them. Everything else in the app reads this through `useAuth()`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<Me | null>(null)

  const dropSession = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus('anonymous')
  }, [])

  // Any 401 anywhere in the app ends the session exactly once, centrally.
  useEffect(() => onUnauthorized(dropSession), [dropSession])

  // Boot: if a token survived the reload, verify it before trusting it.
  useEffect(() => {
    const token = initToken()
    if (token === null) {
      setStatus('anonymous')
      return
    }

    const controller = new AbortController()
    api.me
      .get({ signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return
        setUser(next)
        setStatus('authenticated')
      })
      .catch(() => {
        // An abort is OUR cleanup, not a rejected session — StrictMode runs this
        // effect twice, and treating the first (aborted) request as a failure
        // would call dropSession() and wipe a perfectly good token from storage.
        if (controller.signal.aborted) return
        // A 401 already ran dropSession via onUnauthorized. Anything else
        // (backend down) still can't be treated as a valid session.
        dropSession()
      })

    return () => controller.abort()
  }, [dropSession])

  const adopt = useCallback((token: string, next: Me): Me => {
    setToken(token)
    setUser(next)
    setStatus('authenticated')
    return next
  }, [])

  const login = useCallback(
    async (input: LoginRequest): Promise<Me> => {
      const { token, user: next } = await api.auth.login(input)
      return adopt(token, next)
    },
    [adopt],
  )

  const signup = useCallback(
    async (input: SignupRequest): Promise<Me> => {
      const { token, user: next } = await api.auth.signup(input)
      return adopt(token, next)
    },
    [adopt],
  )

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.auth.logout()
    } catch {
      // Server-side invalidation is best-effort; the local session ends either way.
    } finally {
      dropSession()
    }
  }, [dropSession])

  const refresh = useCallback(async (): Promise<void> => {
    const next = await api.me.get()
    setUser(next)
    setStatus('authenticated')
  }, [])

  const updateProfile = useCallback(async (patch: ProfileUpdate): Promise<UserProfile> => {
    const profile = await api.me.updateProfile(patch)
    setUser((current) => (current === null ? current : { ...current, profile }))
    return profile
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout, refresh, updateProfile }),
    [status, user, login, signup, logout, refresh, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
