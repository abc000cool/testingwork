/**
 * Bearer-token storage.
 *
 * Kept deliberately tiny and framework-free so both the HTTP layer and React
 * can depend on it without a cycle. Uses localStorage so a reload keeps the
 * session; swap the two private helpers if the backend moves to httpOnly
 * cookies and the token stops being the client's business.
 */

const STORAGE_KEY = 'user-system.token'

type Listener = (token: string | null) => void

const listeners = new Set<Listener>()

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private-mode / disabled storage. Fall back to in-memory only.
    return memoryToken
  }
}

function write(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // ignore; memoryToken below is the fallback
  }
}

let memoryToken: string | null = null

export function getToken(): string | null {
  return memoryToken ?? read()
}

export function setToken(token: string | null): void {
  memoryToken = token
  write(token)
  for (const listener of listeners) listener(token)
}

export function clearToken(): void {
  setToken(null)
}

/** Subscribe to token changes. Returns an unsubscribe function. */
export function subscribeToToken(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Hydrate the in-memory copy from storage on boot. */
export function initToken(): string | null {
  memoryToken = read()
  return memoryToken
}
