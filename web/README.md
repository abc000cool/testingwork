# User system — frontend

React 19 + Vite 7 + TypeScript. Talks to the backend in `../src/server/`.

```bash
# terminal 1 — backend (repo root)
npm install
npm run dev                # http://127.0.0.1:4000

# terminal 2 — frontend (this directory)
npm install
npm run dev                # http://localhost:5173
npm run typecheck
npm run build
```

## Why this is a separate workspace

The repo root `package.json` and `tsconfig.json` belong to the backend session
and are Node-only — no `dom` lib, no JSX, and `include: ["src/**/*.ts"]`. Rather
than contend for those files, the frontend keeps its own toolchain here. The two
sides share nothing but the HTTP contract, which is the point.

## Layout

```
web/
  vite.config.ts      dev server + /api proxy
  src/
    types/
      contracts.ts    the agreed cross-session contracts — FROZEN
      wire.ts         request/response shapes outside those contracts
    lib/
      token.ts        bearer-token storage (localStorage + subscribers)
      http.ts         the only fetch call — auth header, JSON, ApiError, 401 hook
      api.ts          one typed function per endpoint
    state/
      auth-context.ts session shape + useAuth()
      AuthProvider.tsx session owner: boot, login, signup, logout, profile patch
      useFavorites.ts list + filters + pagination + writes; public read-only variant
    components/       Layout, RequireAuth, FavoriteList, FormError
    pages/            Login, Signup, Profile, PublicProfile, Favorites, NotFound
```

The dependency direction is one-way: `pages → state → lib → types`. No component
calls `fetch`, and nothing above `lib/http.ts` inspects a raw `Response`.

## Contracts

`src/types/contracts.ts` is a verbatim copy of the two switchboard contracts
(`UserProfile v1`, `Favorite v1`) agreed with the backend session. **Editing it
is a contract break** — renegotiate on the board first.

Everything else about the API — auth bodies, patch payloads, query params — lives
in `src/types/wire.ts`, verified on 2026-07-30 against the backend's `schemas.ts`,
`serializers.ts`, `routes/` and `services/`, then exercised end-to-end through the
dev proxy against a running server.

Details worth knowing, all handled in code:

- **Login takes `usernameOrEmail`**, not `username`. One field, either identifier.
- **Auth returns `{ user, token, expiresAt }`.** Sessions are server-side and
  revocable, so logout is a real revocation rather than dropping a local token.
- **Errors are always `{ error: { code, message, details? } }`.** On a
  `VALIDATION_ERROR`, `details` is `[{path, message}]` — `FormError` renders those
  per field instead of one flat sentence.
- **Duplicate favorites 409 with `details.favoriteId`.** Favorites are unique per
  `(userId, itemType, itemId)`; the add form links to the existing row.
- **Any 401 drops the session once, centrally**, via `onUnauthorized` in
  `lib/http.ts` — no component handles expiry itself.
- **Usernames resolve case-insensitively**; public views never include email.

## The dev proxy

`/api` is proxied to `http://127.0.0.1:4000`. The literal IPv4 address matters:
the backend binds `127.0.0.1`, and `localhost` resolves to `::1` first on current
macOS/Node, which fails to connect against a perfectly healthy server. Override
with `VITE_API_ORIGIN`.

Proxying rather than pointing the browser at `:4000` keeps requests same-origin,
so development matches a production deployment behind one reverse proxy. To skip
the proxy entirely, set `VITE_API_BASE_URL=http://127.0.0.1:4000/api`.

## Not included

No test runner, no data-fetching library, and no design system — the fetch/cache
logic is hand-rolled in `state/`. If this grows past a few more screens, TanStack
Query would replace most of `useFavorites.ts`'s bookkeeping.
