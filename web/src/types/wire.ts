/**
 * Request/response shapes that sit outside the frozen entity contracts.
 *
 * `contracts.ts` holds the two agreed cross-session contracts (the entity types
 * and the list/error envelopes). This file holds everything else in the API
 * surface — auth bodies, patch payloads, query params.
 *
 * Verified against the backend session's `src/server/` on 2026-07-30:
 * `schemas.ts` (zod request validation), `serializers.ts` (response shaping),
 * `routes/`, and `services/authService.ts` / `profileService.ts`.
 */

import type { Favorite, Me, ProfileLink, PublicUser, UserProfile } from './contracts.ts'

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export type SignupRequest = {
  /** 3–30 chars, letters/numbers/hyphen/underscore only. */
  username: string
  email: string
  /** 8–200 chars. */
  password: string
  /** Optional; the backend seeds the profile's display name from it. */
  displayName?: string
}

export type LoginRequest = {
  /** The backend accepts either identifier in this one field. */
  usernameOrEmail: string
  password: string
}

/** `AuthResult` in src/server/services/authService.ts. */
export type AuthResponse = {
  user: Me
  token: string
  /** ISO. Sessions default to 7 days and are revocable server-side. */
  expiresAt: string
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The editable subset of UserProfile. The backend rejects an empty patch, and
 * validates: displayName 1–80, bio ≤500, avatarUrl a real URL or null,
 * location ≤100 or null, links ≤10 with a valid URL each.
 */
export type ProfileUpdate = Partial<{
  displayName: string
  bio: string
  avatarUrl: string | null
  location: string | null
  links: ProfileLink[]
}>

/** GET /api/users/:username/profile — public, never includes email. */
export type PublicProfileResponse = {
  user: PublicUser
  profile: UserProfile
}

/** PATCH /api/me/profile returns the saved profile. */
export type ProfileUpdateResponse = UserProfile

/* -------------------------------------------------------------------------- */
/* Favorites                                                                  */
/* -------------------------------------------------------------------------- */

export type FavoriteCreate = {
  /** Caller-defined namespace, ≤40 chars, `[A-Za-z0-9_-]`. Never validated against a list. */
  itemType: string
  itemId: string
  title?: string | null
  url?: string | null
  note?: string | null
  /** De-duplicated on write. Max 20. */
  tags?: string[]
}

export type FavoriteUpdate = Partial<{
  title: string | null
  url: string | null
  note: string | null
  tags: string[]
}>

/** Query params shared by the private and public favorites lists. */
export type FavoriteQuery = {
  itemType?: string
  tag?: string
  search?: string
  /** 1–100. The backend defaults to 25 when omitted. */
  limit?: number
  offset?: number
}

/** GET /api/me/favorites/types — facet counts for filter UIs. */
export type FavoriteTypeCount = {
  itemType: string
  count: number
}

export type FavoriteTypesResponse = {
  data: FavoriteTypeCount[]
}

export type FavoriteResponse = Favorite

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** The closed set of `error.code` values the backend emits. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'

/** `details` payload on VALIDATION_ERROR. */
export type FieldError = {
  path: string
  message: string
}

/** `details` payload on CONFLICT from POST /api/me/favorites. */
export type ConflictDetails = {
  favoriteId: string
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export type HealthResponse = {
  status: string
  [key: string]: unknown
}
