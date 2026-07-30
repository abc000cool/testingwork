import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { toMessage } from '../lib/http.ts'
import type { ProfileLink } from '../types/contracts.ts'
import { useAuth } from '../state/auth-context.ts'

/** Empty text inputs mean "unset", which the contract spells as null. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function ProfilePage() {
  const { user, updateProfile } = useAuth()

  // RequireAuth guarantees a user, but the type doesn't — keep the guard honest.
  if (user === null) return null
  const { profile } = user

  return <ProfileEditor key={profile.updatedAt} username={user.username} initial={profile} onSave={updateProfile} />
}

type EditorProps = {
  username: string
  initial: {
    displayName: string
    bio: string
    avatarUrl: string | null
    location: string | null
    links: ProfileLink[]
    updatedAt: string
  }
  onSave: (patch: {
    displayName?: string
    bio?: string
    avatarUrl?: string | null
    location?: string | null
    links?: ProfileLink[]
  }) => Promise<unknown>
}

function ProfileEditor({ username, initial, onSave }: EditorProps) {
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [bio, setBio] = useState(initial.bio)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? '')
  const [location, setLocation] = useState(initial.location ?? '')
  const [links, setLinks] = useState<ProfileLink[]>(initial.links)

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  function updateLink(index: number, patch: Partial<ProfileLink>) {
    setLinks((current) =>
      current.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    )
  }

  function addLink() {
    setLinks((current) => [...current, { label: '', url: '' }])
  }

  function removeLink(index: number) {
    setLinks((current) => current.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await onSave({
        displayName: displayName.trim(),
        bio,
        avatarUrl: orNull(avatarUrl),
        location: orNull(location),
        // Drop rows the user added but never filled in.
        links: links.filter((link) => link.label.trim() !== '' || link.url.trim() !== ''),
      })
      setSaved(true)
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h1>Your profile</h1>
        <Link to={`/u/${encodeURIComponent(username)}`} className="muted">
          View public page →
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="form">
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>

        <label>
          Bio
          <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
        </label>

        <label>
          Avatar URL
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>

        <fieldset className="links">
          <legend>Links</legend>

          {links.length === 0 && <p className="muted">No links yet.</p>}

          {links.map((link, index) => (
            // Index keys are correct here: rows have no stable id and are only
            // ever appended to or removed, never reordered.
            <div className="link-row" key={index}>
              <input
                aria-label={`Link ${index + 1} label`}
                placeholder="Label"
                value={link.label}
                onChange={(e) => updateLink(index, { label: e.target.value })}
              />
              <input
                aria-label={`Link ${index + 1} URL`}
                placeholder="https://…"
                value={link.url}
                onChange={(e) => updateLink(index, { url: e.target.value })}
              />
              <button type="button" className="link-button" onClick={() => removeLink(index)}>
                Remove
              </button>
            </div>
          ))}

          <button type="button" className="link-button" onClick={addLink}>
            + Add link
          </button>
        </fieldset>

        {error !== null && <p className="error">{error}</p>}
        {saved && <p className="ok">Saved.</p>}

        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </section>
  )
}
