import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../lib/api.ts'
import { toMessage } from '../lib/http.ts'
import type { Favorite } from '../types/contracts.ts'
import type { FavoriteCreate, FavoriteTypeCount, FavoriteUpdate } from '../types/wire.ts'

export type FavoritesStatus = 'loading' | 'ready' | 'error'

export type FavoritesOptions = {
  pageSize?: number
  itemType?: string
  tag?: string
  search?: string
}

/** The read side: list state, filters and pagination. Shared by both hooks. */
export type FavoritesQueryResult = {
  items: Favorite[]
  total: number
  limit: number
  offset: number
  status: FavoritesStatus
  error: string | null

  itemType: string | undefined
  tag: string | undefined
  search: string | undefined
  /** Changing any filter resets pagination — otherwise you land on an empty page. */
  setItemType: (value: string | undefined) => void
  setTag: (value: string | undefined) => void
  setSearch: (value: string | undefined) => void

  page: number
  pageCount: number
  hasPrev: boolean
  hasNext: boolean
  prevPage: () => void
  nextPage: () => void

  reload: () => void
}

export type UseFavoritesResult = FavoritesQueryResult & {
  /** Facet counts by itemType, refreshed alongside the list. */
  types: FavoriteTypeCount[]
  create: (input: FavoriteCreate) => Promise<Favorite>
  update: (id: string, patch: FavoriteUpdate) => Promise<Favorite>
  remove: (id: string) => Promise<void>
}

/**
 * Core list machinery. `owner` is null for the authenticated user's own list
 * (GET /api/me/favorites) or a username for the public one
 * (GET /api/users/:username/favorites) — same envelope, same filters.
 */
type QueryInternals = {
  /** Patch the loaded page without a refetch. */
  setItems: React.Dispatch<React.SetStateAction<Favorite[]>>
  /** Increments on every reload — the exact dependency for derived fetches. */
  reloadToken: number
}

function useFavoritesQuery(
  owner: string | null,
  options: FavoritesOptions,
): [FavoritesQueryResult, QueryInternals] {
  const limit = options.pageSize ?? 20

  const [itemType, setItemTypeState] = useState<string | undefined>(options.itemType)
  const [tag, setTagState] = useState<string | undefined>(options.tag)
  const [search, setSearchState] = useState<string | undefined>(options.search)
  const [offset, setOffset] = useState(0)

  const [items, setItems] = useState<Favorite[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<FavoritesStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const query = { itemType, tag, search, limit, offset }

    setStatus('loading')
    setError(null)

    const pending =
      owner === null
        ? api.favorites.list(query, { signal: controller.signal })
        : api.users.favorites(owner, query, { signal: controller.signal })

    pending
      .then((envelope) => {
        if (controller.signal.aborted) return
        setItems(envelope.data)
        setTotal(envelope.total)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(toMessage(cause))
        setStatus('error')
      })

    return () => controller.abort()
  }, [owner, itemType, tag, search, limit, offset, reloadToken])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  // Empty string is what a cleared text input yields; the API wants it absent.
  const setItemType = useCallback((value: string | undefined) => {
    setOffset(0)
    setItemTypeState(value === '' ? undefined : value)
  }, [])

  const setTag = useCallback((value: string | undefined) => {
    setOffset(0)
    setTagState(value === '' ? undefined : value)
  }, [])

  const setSearch = useCallback((value: string | undefined) => {
    setOffset(0)
    setSearchState(value === '' ? undefined : value)
  }, [])

  const pagination = useMemo(() => {
    const pageCount = Math.max(1, Math.ceil(total / limit))
    const page = Math.floor(offset / limit) + 1
    return { pageCount, page, hasPrev: offset > 0, hasNext: offset + limit < total }
  }, [total, limit, offset])

  const prevPage = useCallback(() => setOffset((n) => Math.max(0, n - limit)), [limit])
  const nextPage = useCallback(() => setOffset((n) => n + limit), [limit])

  return {
    items,
    total,
    limit,
    offset,
    status,
    error,
    itemType,
    tag,
    search,
    setItemType,
    setTag,
    setSearch,
    ...pagination,
    prevPage,
    nextPage,
    reload,
  }
}

/**
 * The signed-in user's favorites: one paginated, filtered view of
 * GET /api/me/favorites plus the writes that invalidate it. Pages call this
 * instead of touching the API client, so list behaviour lives in one place.
 */
export function useFavorites(options: FavoritesOptions = {}): UseFavoritesResult {
  const query = useFavoritesQuery(null, options)
  const { reload } = query

  const [types, setTypes] = useState<FavoriteTypeCount[]>([])

  // Facet counts shift on every write, so refetch them whenever the list reloads.
  const listLength = query.items.length
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    api.favorites
      .types({ signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setTypes(response.data)
      })
      .catch(() => {
        // Facets are a convenience; a failure here must not blank the list.
        if (!controller.signal.aborted) setTypes([])
      })
    return () => controller.abort()
  }, [listLength])

  const create = useCallback(
    async (input: FavoriteCreate): Promise<Favorite> => {
      const created = await api.favorites.create(input)
      // Changes total and page boundaries — refetch rather than splice locally.
      reload()
      return created
    },
    [reload],
  )

  const update = useCallback(async (id: string, patch: FavoriteUpdate): Promise<Favorite> => {
    const updated = await api.favorites.update(id, patch)
    // In place: an edit can't move a row to a different page.
    return updated
  }, [])

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await api.favorites.remove(id)
      reload()
    },
    [reload],
  )

  return { ...query, types, create, update, remove }
}

/** Read-only view of someone else's favorites. No token required. */
export function usePublicFavorites(
  username: string,
  options: FavoritesOptions = {},
): FavoritesQueryResult {
  return useFavoritesQuery(username, options)
}
