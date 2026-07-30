/**
 * Typed client for the backend session's API surface.
 *
 * One function per endpoint, mirroring exactly what the backend announced:
 *
 *   POST   /api/auth/signup
 *   POST   /api/auth/login
 *   POST   /api/auth/logout
 *   GET    /api/me
 *   PATCH  /api/me/profile
 *   GET    /api/users/:username/profile        (public)
 *   GET    /api/users/:username/favorites      (public, same envelope + filters)
 *   GET    /api/me/favorites                   (?itemType=&tag=&search=&limit=&offset=)
 *   GET    /api/me/favorites/types             facet counts
 *   POST   /api/me/favorites
 *   GET    /api/me/favorites/:id
 *   PATCH  /api/me/favorites/:id
 *   DELETE /api/me/favorites/:id
 *   GET    /api/health
 *
 * Components never call `request` directly — they call these.
 */

import type { Favorite, ListEnvelope, Me } from '../types/contracts.ts'
import type {
  AuthResponse,
  FavoriteCreate,
  FavoriteQuery,
  FavoriteTypesResponse,
  FavoriteUpdate,
  HealthResponse,
  LoginRequest,
  ProfileUpdate,
  PublicProfileResponse,
  ProfileUpdateResponse,
  SignupRequest,
} from '../types/wire.ts'
import { request } from './http.ts'

type Ctx = { signal?: AbortSignal }

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export const auth = {
  signup(input: SignupRequest, ctx: Ctx = {}): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: input,
      auth: false,
      signal: ctx.signal,
    })
  },

  login(input: LoginRequest, ctx: Ctx = {}): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
      signal: ctx.signal,
    })
  },

  /** Best-effort server-side invalidation. The client drops the token regardless. */
  logout(ctx: Ctx = {}): Promise<void> {
    return request<void>('/auth/logout', { method: 'POST', signal: ctx.signal })
  },
}

/* -------------------------------------------------------------------------- */
/* Me + profiles                                                              */
/* -------------------------------------------------------------------------- */

export const me = {
  get(ctx: Ctx = {}): Promise<Me> {
    return request<Me>('/me', { signal: ctx.signal })
  },

  updateProfile(patch: ProfileUpdate, ctx: Ctx = {}): Promise<ProfileUpdateResponse> {
    return request<ProfileUpdateResponse>('/me/profile', {
      method: 'PATCH',
      body: patch,
      signal: ctx.signal,
    })
  },
}

export const users = {
  /** Public profile view — no token required, never includes email. */
  profile(username: string, ctx: Ctx = {}): Promise<PublicProfileResponse> {
    return request<PublicProfileResponse>(`/users/${encodeURIComponent(username)}/profile`, {
      auth: false,
      signal: ctx.signal,
    })
  },

  /** Public favorites list — same envelope and filters as the private one. */
  favorites(
    username: string,
    query: FavoriteQuery = {},
    ctx: Ctx = {},
  ): Promise<ListEnvelope<Favorite>> {
    return request<ListEnvelope<Favorite>>(`/users/${encodeURIComponent(username)}/favorites`, {
      auth: false,
      query: { ...query },
      signal: ctx.signal,
    })
  },
}

/* -------------------------------------------------------------------------- */
/* Favorites                                                                  */
/* -------------------------------------------------------------------------- */

export const favorites = {
  list(query: FavoriteQuery = {}, ctx: Ctx = {}): Promise<ListEnvelope<Favorite>> {
    return request<ListEnvelope<Favorite>>('/me/favorites', {
      query: { ...query },
      signal: ctx.signal,
    })
  },

  /** Facet counts by itemType, for populating filter controls. */
  types(ctx: Ctx = {}): Promise<FavoriteTypesResponse> {
    return request<FavoriteTypesResponse>('/me/favorites/types', { signal: ctx.signal })
  },

  get(id: string, ctx: Ctx = {}): Promise<Favorite> {
    return request<Favorite>(`/me/favorites/${encodeURIComponent(id)}`, { signal: ctx.signal })
  },

  create(input: FavoriteCreate, ctx: Ctx = {}): Promise<Favorite> {
    return request<Favorite>('/me/favorites', {
      method: 'POST',
      body: input,
      signal: ctx.signal,
    })
  },

  update(id: string, patch: FavoriteUpdate, ctx: Ctx = {}): Promise<Favorite> {
    return request<Favorite>(`/me/favorites/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      signal: ctx.signal,
    })
  },

  remove(id: string, ctx: Ctx = {}): Promise<void> {
    return request<void>(`/me/favorites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: ctx.signal,
    })
  },
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export function health(ctx: Ctx = {}): Promise<HealthResponse> {
  return request<HealthResponse>('/health', { auth: false, signal: ctx.signal })
}

export const api = { auth, me, users, favorites, health }
