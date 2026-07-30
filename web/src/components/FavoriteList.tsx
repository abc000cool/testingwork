import { useState } from 'react'

import { toMessage } from '../lib/http.ts'
import type { FavoritesQueryResult } from '../state/useFavorites.ts'
import type { Favorite } from '../types/contracts.ts'

/**
 * Renders any favorites query — the signed-in user's or a public one. Passing
 * `onRemove` is what makes rows editable, so the public list simply omits it.
 */
export function FavoriteList({
  query,
  onRemove,
  emptyMessage = 'Nothing here yet.',
}: {
  query: FavoritesQueryResult
  onRemove?: (id: string) => Promise<void>
  emptyMessage?: string
}) {
  return (
    <>
      {query.status === 'loading' && <p className="muted">Loading…</p>}
      {query.status === 'error' && <p className="error">{query.error}</p>}
      {query.status === 'ready' && query.items.length === 0 && (
        <p className="muted">{emptyMessage}</p>
      )}

      <ul className="favorites">
        {query.items.map((favorite) => (
          <FavoriteRow key={favorite.id} favorite={favorite} onRemove={onRemove} />
        ))}
      </ul>

      {query.total > query.limit && (
        <div className="pager">
          <button type="button" onClick={query.prevPage} disabled={!query.hasPrev}>
            ← Previous
          </button>
          <span className="muted small">
            Page {query.page} of {query.pageCount} · {query.total} total
          </span>
          <button type="button" onClick={query.nextPage} disabled={!query.hasNext}>
            Next →
          </button>
        </div>
      )}
    </>
  )
}

function FavoriteRow({
  favorite,
  onRemove,
}: {
  favorite: Favorite
  onRemove?: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove() {
    if (onRemove === undefined) return
    setBusy(true)
    setError(null)
    try {
      await onRemove(favorite.id)
      // No setBusy(false) on success: the row unmounts with the refreshed list.
    } catch (cause) {
      setError(toMessage(cause))
      setBusy(false)
    }
  }

  return (
    <li className="favorite" id={`favorite-${favorite.id}`}>
      <div className="favorite-main">
        <div>
          <span className="badge">{favorite.itemType}</span>
          {favorite.url !== null ? (
            <a href={favorite.url} target="_blank" rel="noreferrer noopener">
              {favorite.title ?? favorite.itemId}
            </a>
          ) : (
            <span>{favorite.title ?? favorite.itemId}</span>
          )}
        </div>

        {favorite.note !== null && <p className="muted small">{favorite.note}</p>}

        {favorite.tags.length > 0 && (
          <p className="tags">
            {favorite.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </p>
        )}

        {error !== null && <p className="error small">{error}</p>}
      </div>

      {onRemove !== undefined && (
        <button type="button" className="link-button" onClick={handleRemove} disabled={busy}>
          {busy ? 'Removing…' : 'Remove'}
        </button>
      )}
    </li>
  )
}
