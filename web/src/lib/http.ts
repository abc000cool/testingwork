/**
 * The single place the frontend talks to the network.
 *
 * Responsibilities:
 *   - prefix every path with the API base
 *   - attach `Authorization: Bearer <token>`
 *   - serialise/parse JSON
 *   - turn the contract's `{ error: { code, message, details? } }` envelope into
 *     a typed ApiError, so nothing above this layer inspects raw responses
 *   - surface 401s once, centrally, so the auth layer can drop the session
 */

import { isApiErrorBody } from '../types/contracts.ts'
import type { FieldError } from '../types/wire.ts'
import { getToken } from './token.ts'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api'

const DEFAULT_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number
  /** Machine-readable code from the error envelope. */
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** True when the failure was transport-level rather than an API response. */
  get isNetworkError(): boolean {
    return this.status === 0
  }
}

/* -------------------------------------------------------------------------- */
/* 401 handling                                                               */
/* -------------------------------------------------------------------------- */

type UnauthorizedHandler = () => void

const unauthorizedHandlers = new Set<UnauthorizedHandler>()

/**
 * Register a callback fired whenever the API rejects our credentials.
 * The auth provider uses this to clear the session without http.ts having to
 * import React or the auth store.
 */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler)
  return () => {
    unauthorizedHandlers.delete(handler)
  }
}

/* -------------------------------------------------------------------------- */
/* Request                                                                    */
/* -------------------------------------------------------------------------- */

export type QueryValue = string | number | boolean | undefined | null

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, QueryValue>
  /** Send the bearer token. Defaults to true; auth + public endpoints pass false. */
  auth?: boolean
  signal?: AbortSignal
  timeoutMs?: number
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${BASE_URL}${path}`
  if (!query) return url

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const headers: Record<string, string> = { Accept: 'application/json' }

  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combineSignals(signal, timeoutMs),
    })
  } catch (cause) {
    // Caller-initiated aborts propagate untouched so effects can ignore them.
    if (cause instanceof DOMException && cause.name === 'AbortError' && signal?.aborted) {
      throw cause
    }
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError'
    throw new ApiError(
      0,
      timedOut ? 'timeout' : 'network_error',
      timedOut
        ? `Request to ${path} timed out after ${timeoutMs}ms.`
        : `Could not reach the API. Is the backend running on ${BASE_URL}?`,
      cause,
    )
  }

  if (response.status === 401) {
    for (const handler of unauthorizedHandlers) handler()
  }

  // 204 and empty bodies are legitimate (logout, delete).
  const raw = await response.text()
  const payload: unknown = raw.length > 0 ? safeParse(raw) : undefined

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiError(response.status, payload.error.code, payload.error.message, payload.error.details)
    }
    // Backend broke its own error contract (proxy error page, 502, crash).
    throw new ApiError(
      response.status,
      'malformed_error_response',
      `${method} ${path} failed with ${response.status} and a non-contract error body.`,
      raw.slice(0, 500),
    )
  }

  return payload as T
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Human-facing message for any thrown value. Use in catch blocks. */
export function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

/**
 * Per-field messages from a VALIDATION_ERROR, so forms can explain *which*
 * input the backend rejected instead of showing one flat sentence.
 * Returns [] for every other failure.
 */
export function fieldErrors(error: unknown): FieldError[] {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return []
  if (!Array.isArray(error.details)) return []

  return error.details.flatMap((entry): FieldError[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { path, message } = entry as { path?: unknown; message?: unknown }
    if (typeof path !== 'string' || typeof message !== 'string') return []
    return [{ path, message }]
  })
}

/**
 * Favorites are unique per (userId, itemType, itemId); a duplicate POST is a 409
 * carrying the existing id, so the UI can point at the row instead of dead-ending.
 */
export function conflictFavoriteId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'CONFLICT') return null
  if (typeof error.details !== 'object' || error.details === null) return null
  const { favoriteId } = error.details as { favoriteId?: unknown }
  return typeof favoriteId === 'string' ? favoriteId : null
}
