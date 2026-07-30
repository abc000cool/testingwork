import { createContext, useContext } from 'react'

import type { Me, UserProfile } from '../types/contracts.ts'
import type { LoginRequest, ProfileUpdate, SignupRequest } from '../types/wire.ts'

/**
 * `loading` covers the boot-time "we have a token, is it still good?" window.
 * Route guards must render nothing during it, or a refresh flashes the login
 * page before the session resolves.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  status: AuthStatus
  user: Me | null
  login: (input: LoginRequest) => Promise<Me>
  signup: (input: SignupRequest) => Promise<Me>
  logout: () => Promise<void>
  /** Re-fetch GET /api/me. */
  refresh: () => Promise<void>
  /** PATCH /api/me/profile and merge the result into the cached user. */
  updateProfile: (patch: ProfileUpdate) => Promise<UserProfile>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth() must be called inside <AuthProvider>.')
  }
  return value
}
