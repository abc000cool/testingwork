import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../lib/api.ts'
import { toMessage } from '../lib/http.ts'
import type { Favorite } from '../types/contracts.ts'
import type { FavoriteCreate, FavoriteUpdate } from '../types/wire.ts'

export type FavoritesStatus = 'loading' | 'ready' | 'error'

export type UseFavoritesOptions = {
  pageSize?: number
  itemType?: string
  tag?: string
}

export type UseFavoritesResult = {
  items: Favorite[]
  total: number
  limit: number
  offset: number
  status: FavoritesStatus
  error: string | null

  itemType: string | undefined
  tag: string | undefined
  /** Changing a filter resets pagination — otherwise you land on an empty page. */
  setItemType: (value: string | undefined) => void
  setTag: (value: string | undefined) => void

  page: number
  pageCount: number
  hasPrev: boolean
  hasNext: boolean
  prevPage: () => void
  nextPage: () => void

  reload: () => void
  create: (input: FavoriteCreate) => Promise<Favorite>
  update: (id: string, patch: FavoriteUpdate) => Promise<Favorite>
  remove: (id: string) => Promise<void>
}

/**
 * Owns one paginated, filtered view of GET /api/me/favorites, plus the writes
 * that invalidate it. Pages that need favorites call this instead of touching
 * the API client, so list/filter/pagination behaviour stays in one place.
 */
export function useFavorites(options: UseFavoritesOptions = {}): UseFavoritesResult {
  const limit = options.pageSize ?? 20

  const [itemType, setItemTypeState] = useState<string | undefined>(options.itemType)
  const [tag, setTagState] = useState<string | undefined>(options.tag)
  const [offset, setOffset] = useState(0)

  const [items, setItems] = useState<Favorite[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<FavoritesStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    api.favorites
      .list({ itemType, tag, limit, offset }, { signal: controller.signal })
      .then((envelope) => {
        if (!mounted.current || controller.signal.aborted) return
        setItems(envelope.data)
        setTotal(envelope.total)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (!mounted.current || controller.signal.aborted) return
        setError(toMessage(cause))
        setStatus('error')
      })

    return () => controller.abort()
  }, [itemType, tag, limit, offset, reloadToken])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  const setItemType = useCallback((value: string | undefined) => {
    setOffset(0)
    setItemTypeState(value === '' ? undefined : value)
  }, [])

  const setTag = useCallback((value: string | undefined) => {
    setOffset(0)
    setTagState(value === '' ? undefined : value)
  }, [])

  const create = useCallback(
    async (input: FavoriteCreate): Promise<Favorite> => {
      const created = await api.favorites.create(input)
      // Affects total and page boundaries — refetch rather than splice locally.
      reload()
      return created
    },
    [reload],
  )

  const update = useCallback(async (id: string, patch: FavoriteUpdate): Promise<Favorite> => {
    const updated = await api.favorites.update(id, patch)
    // In-place: an edit can't change which page the row belongs to.
    setItems((current) => current.map((item) => (item.id === id ? updated : item)))
    return updated
  }, [])

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await api.favorites.remove(id)
      reload()
    },
    [reload],
  )

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
    setItemType,
    setTag,
    ...pagination,
    prevPage,
    nextPage,
    reload,
    create,
    update,
    remove,
  }
}
