import { Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout.tsx'
import { RequireAuth } from './components/RequireAuth.tsx'
import { FavoritesPage } from './pages/FavoritesPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { PublicProfilePage } from './pages/PublicProfilePage.tsx'
import { SignupPage } from './pages/SignupPage.tsx'
import { useAuth } from './state/auth-context.ts'

export default function App() {
  const { status } = useAuth()

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            status === 'loading' ? null : (
              <Navigate to={status === 'authenticated' ? '/profile' : '/login'} replace />
            )
          }
        />

        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Public: readable without a token. */}
        <Route path="/u/:username" element={<PublicProfilePage />} />

        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/favorites"
          element={
            <RequireAuth>
              <FavoritesPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
