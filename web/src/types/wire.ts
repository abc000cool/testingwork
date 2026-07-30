/**
 * Request/response shapes that the agreed contracts do NOT pin down.
 *
 * `UserProfile v1` and `Favorite v1` fixed the *entity* types and the list/error
 * envelopes, but not the auth bodies or the PATCH payloads. Everything in this
 * file is therefore a frontend *assumption* about the backend session's API.
 *
 * If the backend disagrees, this file is the only place that has to change —
 * `contracts.ts` stays frozen and no component touches raw wire shapes.
 *
 * Open questions for the backend session, in priority order:
 *   1. Does login take `username` or `email` (or either) as the identifier?
 *   2. Does the auth response return `{ token, user }`, or just `{ token }`
 *      with the client following up on GET /api/me?
 *   3. Is the token opaque, and does it carry an expiry the client should read?
 *   4. Does DELETE /api/me/favorites/:id return 204, or the deleted Favorite?
 */

import type { Favorite, Me, ProfileLink, PublicUser, UserProfile } from './contracts.ts'

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export type SignupRequest = {
  username: string
  email: string
  password: string
}

export type LoginRequest = {
  username: string
  password: string
}

/** ASSUMED: both signup and login return a bearer token plus the current user. */
export type AuthResponse = {
  token: string
  user: Me
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

/** The editable subset of UserProfile. Server-owned fields are excluded. */
export type ProfileUpdate = Partial<{
  displayName: string
  bio: string
  avatarUrl: string | null
  location: string | null
  links: ProfileLink[]
}>

/** ASSUMED shape of GET /api/users/:username/profile (public view). */
export type PublicProfileResponse = {
  user: PublicUser
  profile: UserProfile
}

/** ASSUMED: PATCH /api/me/profile echoes back the saved profile. */
export type ProfileUpdateResponse = UserProfile

/* -------------------------------------------------------------------------- */
/* Favorites                                                                  */
/* -------------------------------------------------------------------------- */

export type FavoriteCreate = {
  itemType: string
  itemId: string
  title?: string | null
  url?: string | null
  note?: string | null
  tags?: string[]
}

export type FavoriteUpdate = Partial<{
  title: string | null
  url: string | null
  note: string | null
  tags: string[]
}>

/** Query params for GET /api/me/favorites. */
export type FavoriteQuery = {
  itemType?: string
  tag?: string
  limit?: number
  offset?: number
}

/** ASSUMED: create and patch both return the resulting Favorite. */
export type FavoriteResponse = Favorite

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export type HealthResponse = {
  status: string
  [key: string]: unknown
}
