import { useState, type FormEvent } from 'react'

import { FavoriteList } from '../components/FavoriteList.tsx'
import { FormError } from '../components/FormError.tsx'
import { conflictFavoriteId } from '../lib/http.ts'
import { useFavorites } from '../state/useFavorites.ts'
import type { FavoriteTypeCount } from '../types/wire.ts'

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

      <AddFavoriteForm onCreate={favorites.create} knownTypes={favorites.types} />

      <div className="filters">
        <label>
          Type
          <select
            value={favorites.itemType ?? ''}
            onChange={(e) => favorites.setItemType(e.target.value)}
          >
            <option value="">All types</option>
            {favorites.types.map((type) => (
              <option key={type.itemType} value={type.itemType}>
                {type.itemType} ({type.count})
              </option>
            ))}
          </select>
        </label>

        <label>
          Tag
          <input
            value={favorites.tag ?? ''}
            onChange={(e) => favorites.setTag(e.target.value)}
            placeholder="filter by tag"
          />
        </label>

        <label>
          Search
          <input
            value={favorites.search ?? ''}
            onChange={(e) => favorites.setSearch(e.target.value)}
            placeholder="title, note…"
          />
        </label>
      </div>

      <FavoriteList query={favorites} onRemove={favorites.remove} />
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function AddFavoriteForm({
  onCreate,
  knownTypes,
}: {
  onCreate: ReturnType<typeof useFavorites>['create']
  knownTypes: FavoriteTypeCount[]
}) {
  const [itemType, setItemType] = useState('')
  const [itemId, setItemId] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setDuplicateId(null)
    try {
      await onCreate({
        itemType: itemType.trim(),
        itemId: itemId.trim(),
        title: title.trim() || null,
        url: url.trim() || null,
        note: note.trim() || null,
        tags: parseTags(tags),
      })
      // Keep itemType — people usually add several of the same kind in a row.
      setItemId('')
      setTitle('')
      setUrl('')
      setNote('')
      setTags('')
    } catch (cause) {
      // Favorites are unique per (userId, itemType, itemId). A duplicate comes
      // back as 409 carrying the existing id, so link to it instead of just
      // reporting a failure.
      const existing = conflictFavoriteId(cause)
      if (existing !== null) setDuplicateId(existing)
      else setError(cause)
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
            list="known-item-types"
            required
          />
          <datalist id="known-item-types">
            {knownTypes.map((type) => (
              <option key={type.itemType} value={type.itemType} />
            ))}
          </datalist>
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

      <FormError error={error} />

      {duplicateId !== null && (
        <p className="error" role="alert">
          You already saved this one.{' '}
          <a href={`#favorite-${duplicateId}`}>Jump to it</a> — it may be on another page.
        </p>
      )}

      <button type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add favorite'}
      </button>
    </form>
  )
}
