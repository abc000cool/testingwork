/**
 * Agreed cross-session contracts. DO NOT edit unilaterally.
 *
 * These types are transcribed verbatim from the switchboard contracts
 * `UserProfile v1` and `Favorite v1`, both agreed with the backend session
 * that owns `src/server/**`. Any change here is a contract break and has to be
 * renegotiated on the board before either side ships it.
 */

/* -------------------------------------------------------------------------- */
/* UserProfile v1                                                             */
/* -------------------------------------------------------------------------- */

export type PublicUser = {
  id: string
  username: string
  createdAt: string /* ISO */
}

export type ProfileLink = {
  label: string
  url: string
}

export type UserProfile = {
  userId: string
  displayName: string
  bio: string
  avatarUrl: string | null
  location: string | null
  links: ProfileLink[]
  updatedAt: string /* ISO */
}

export type Me = PublicUser & {
  email: string
  profile: UserProfile
}

/* -------------------------------------------------------------------------- */
/* Favorite v1                                                                */
/* -------------------------------------------------------------------------- */

export type Favorite = {
  id: string
  userId: string
  itemType: string // caller-defined namespace, e.g. "movie" | "article"
  itemId: string // unique within (userId, itemType)
  title: string | null
  url: string | null
  note: string | null
  tags: string[]
  createdAt: string /* ISO */
}

/** List responses are envelope-shaped. */
export type ListEnvelope<T> = {
  data: T[]
  total: number
  limit: number
  offset: number
}

/** Errors are always this shape, on every non-2xx response. */
export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/** Narrowing helper for the error envelope, used by the HTTP layer. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const { error } = value as { error?: unknown }
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && typeof message === 'string'
}
