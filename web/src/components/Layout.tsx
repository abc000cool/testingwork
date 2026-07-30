import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../state/auth-context.ts'

export function Layout({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          User System
        </Link>

        <nav className="nav">
          {status === 'authenticated' ? (
            <>
              <NavLink to="/profile">Profile</NavLink>
              <NavLink to="/favorites">Favorites</NavLink>
              <span className="muted">{user?.username}</span>
              <button type="button" className="link-button" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : status === 'anonymous' ? (
            <>
              <NavLink to="/login">Log in</NavLink>
              <NavLink to="/signup">Sign up</NavLink>
            </>
          ) : null}
        </nav>
      </header>

      <main className="content">{children}</main>
    </div>
  )
}
