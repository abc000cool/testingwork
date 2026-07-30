import { useState, type FormEvent } from 'react'

import { toMessage } from '../lib/http.ts'
import { useFavorites } from '../state/useFavorites.ts'
import type { Favorite } from '../types/contracts.ts'

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

export function FavoritesPage() {
  const favorites = useFavorites({ pageSize: 20 })

  return (
    <section className="panel">
      <h1>Your favorites</h1>

      <AddFavoriteForm onCreate={favorites.create} />

      <div className="filters">
        <label>
          Type
          <input
            value={favorites.itemType ?? ''}
            onChange={(e) => favorites.setItemType(e.target.value)}
            placeholder="movie, article…"
          />
        </label>
        <label>
          Tag
          <input
            value={favorites.tag ?? ''}
            onChange={(e) => favorites.setTag(e.target.value)}
            placeholder="filter by tag"
          />
        </label>
      </div>

      {favorites.status === 'loading' && <p className="muted">Loading…</p>}
      {favorites.status === 'error' && <p className="error">{favorites.error}</p>}

      {favorites.status === 'ready' && favorites.items.length === 0 && (
        <p className="muted">Nothing here yet.</p>
      )}

      <ul className="favorites">
        {favorites.items.map((favorite) => (
          <FavoriteRow key={favorite.id} favorite={favorite} onRemove={favorites.remove} />
        ))}
      </ul>

      {favorites.total > favorites.limit && (
        <div className="pager">
          <button type="button" onClick={favorites.prevPage} disabled={!favorites.hasPrev}>
            ← Previous
          </button>
          <span className="muted">
            Page {favorites.page} of {favorites.pageCount} · {favorites.total} total
          </span>
          <button type="button" onClick={favorites.nextPage} disabled={!favorites.hasNext}>
            Next →
          </button>
        </div>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function AddFavoriteForm({
  onCreate,
}: {
  onCreate: ReturnType<typeof useFavorites>['create']
}) {
  const [itemType, setItemType] = useState('')
  const [itemId, setItemId] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onCreate({
        itemType: itemType.trim(),
        itemId: itemId.trim(),
        title: title.trim() || null,
        url: url.trim() || null,
        note: note.trim() || null,
        tags: parseTags(tags),
      })
      setItemId('')
      setTitle('')
      setUrl('')
      setNote('')
      setTags('')
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form add-favorite">
      <div className="row">
        <label>
          Type
          <input
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            placeholder="movie"
            required
          />
        </label>
        <label>
          Item ID
          <input
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="tt0111161"
            required
          />
        </label>
      </div>

      <div className="row">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
      </div>

      <label>
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <label>
        Tags <span className="muted small">(comma separated)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>

      {error !== null && <p className="error">{error}</p>}

      <button type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add favorite'}
      </button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */

function FavoriteRow({
  favorite,
  onRemove,
}: {
  favorite: Favorite
  onRemove: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove() {
    setBusy(true)
    setError(null)
    try {
      await onRemove(favorite.id)
    } catch (cause) {
      setError(toMessage(cause))
      setBusy(false)
    }
  }

  return (
    <li className="favorite">
      <div className="favorite-main">
        <span className="badge">{favorite.itemType}</span>
        {favorite.url !== null ? (
          <a href={favorite.url} target="_blank" rel="noreferrer noopener">
            {favorite.title ?? favorite.itemId}
          </a>
        ) : (
          <span>{favorite.title ?? favorite.itemId}</span>
        )}
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

      <button type="button" className="link-button" onClick={handleRemove} disabled={busy}>
        {busy ? 'Removing…' : 'Remove'}
      </button>
    </li>
  )
}
