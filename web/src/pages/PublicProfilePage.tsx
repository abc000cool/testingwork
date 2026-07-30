import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { FavoriteList } from '../components/FavoriteList.tsx'
import { api } from '../lib/api.ts'
import { ApiError, toMessage } from '../lib/http.ts'
import { usePublicFavorites } from '../state/useFavorites.ts'
import type { PublicProfileResponse } from '../types/wire.ts'

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>()

  if (username === undefined || username === '') {
    return <p className="muted">No user specified.</p>
  }

  // Keyed so switching between two profiles remounts rather than showing the
  // previous user's data while the new request is in flight.
  return <PublicProfile key={username} username={username} />
}

function PublicProfile({ username }: { username: string }) {
  const [data, setData] = useState<PublicProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const favorites = usePublicFavorites(username, { pageSize: 20 })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setNotFound(false)

    api.users
      .profile(username, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return
        setData(next)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 404) setNotFound(true)
        else setError(toMessage(cause))
        setLoading(false)
      })

    return () => controller.abort()
  }, [username])

  if (loading) return <p className="muted">Loading…</p>
  if (notFound) return <p className="muted">No user named “{username}”.</p>
  if (error !== null) return <p className="error">{error}</p>
  if (data === null) return null

  const { user, profile } = data

  return (
    <section className="panel">
      <header className="profile-head">
        {profile.avatarUrl !== null && <img className="avatar" src={profile.avatarUrl} alt="" />}
        <div>
          <h1>{profile.displayName || user.username}</h1>
          <p className="muted">
            @{user.username}
            {profile.location !== null && <> · {profile.location}</>}
          </p>
        </div>
      </header>

      {profile.bio !== '' && <p className="bio">{profile.bio}</p>}

      {profile.links.length > 0 && (
        <ul className="link-list">
          {profile.links.map((link) => (
            <li key={`${link.label}:${link.url}`}>
              <a href={link.url} target="_blank" rel="noreferrer noopener">
                {link.label || link.url}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small">Joined {new Date(user.createdAt).toLocaleDateString()}</p>

      <h2 className="section-heading">Favorites</h2>
      <FavoriteList
        query={favorites}
        emptyMessage={`${profile.displayName || user.username} hasn’t saved anything public yet.`}
      />
    </section>
  )
}
