# User System

A small, complete account system: signup and login, editable profiles, and a
per-user favorites list with filtering, search and pagination. Public profile
pages are readable without a token.

The repo holds two independent workspaces that share nothing but an HTTP
contract:

| Workspace | Stack | Dev URL |
| --- | --- | --- |
| `./` (backend) | Node 24 + Express 5 + zod, TypeScript run directly by Node's type stripping — no build step | `http://127.0.0.1:4000` |
| `web/` (frontend) | React 19 + Vite 7 + React Router 7 + TypeScript | `http://localhost:5173` |

Each has its own `package.json`, `tsconfig.json` and README; this file is the
map over both.

- [Quick start](#quick-start)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Validation rules](#validation-rules)
- [Auth and security](#auth-and-security)
- [Persistence](#persistence)
- [Configuration](#configuration)
- [Testing and typechecking](#testing-and-typechecking)
- [Behaviour worth knowing](#behaviour-worth-knowing)
- [Deployment notes](#deployment-notes)
- [What is deliberately missing](#what-is-deliberately-missing)

## Quick start

Requires Node **>= 22.18** (the backend relies on native TypeScript type
stripping, so `node src/server/index.ts` runs `.ts` files with no compile step).

```bash
# terminal 1 — backend, from the repo root
npm install
cp .env.example .env        # optional; every value has a working default
npm run dev                 # watch mode on http://127.0.0.1:4000

# terminal 2 — frontend
cd web
npm install
npm run dev                 # http://localhost:5173, /api proxied to the backend
```

Then open <http://localhost:5173>, sign up, and you land on your profile. A
smoke test without the browser:

```bash
curl -s localhost:4000/api/health
# {"status":"ok","uptimeSeconds":3}

TOKEN=$(curl -s localhost:4000/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"username":"ada","email":"ada@example.com","password":"correcthorse"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -s localhost:4000/api/me -H "Authorization: Bearer $TOKEN"
```

Available scripts:

| Command | Where | What it does |
| --- | --- | --- |
| `npm run dev` | root | API in watch mode, loads `.env` if present |
| `npm start` | root | API without the watcher |
| `npm test` | root | 18 integration tests over the real app, in-memory |
| `npm run typecheck` | root, `web/` | `tsc --noEmit` |
| `npm run dev` | `web/` | Vite dev server with the `/api` proxy |
| `npm run build` | `web/` | typecheck, then production bundle into `web/dist/` |
| `npm run preview` | `web/` | serve the built bundle locally |

## Repository layout

```
.
├── src/server/            the API (see src/server/README.md)
│   ├── index.ts             bootstrap: listen, session purge, graceful shutdown
│   ├── app.ts               express wiring — middleware order, route mounting
│   ├── container.ts         composition root: construct everything, inject downward
│   ├── config.ts            environment → typed Config
│   ├── types.ts             stored records + wire types (the cross-team contract)
│   ├── schemas.ts           zod schemas; the only place request input is trusted
│   ├── serializers.ts       record → wire payload; the only place responses are shaped
│   ├── crypto.ts            scrypt hashing, id and token generation
│   ├── errors.ts            AppError + status helpers
│   ├── app.test.ts          18 integration tests
│   ├── store/               JsonStore — the only code that knows about persistence
│   ├── repositories/        data access over the store's arrays
│   ├── services/            business rules (auth, profile, favorites)
│   ├── middleware/          auth, cors, rateLimit, errorHandler
│   └── routes/              HTTP surface only: parse → call service → send
├── web/                   the SPA (see web/README.md)
│   ├── vite.config.ts       dev server + /api proxy
│   └── src/
│       ├── types/           contracts.ts (frozen) + wire.ts
│       ├── lib/             token.ts, http.ts (the only fetch), api.ts
│       ├── state/           AuthProvider, auth-context, useFavorites
│       ├── components/      Layout, RequireAuth, FavoriteList, FormError
│       └── pages/           Login, Signup, Profile, PublicProfile, Favorites, NotFound
├── .env.example           backend configuration, documented inline
├── index.html             an unrelated standalone static page ("Deep Sea Facts"),
│                          kept in the repo root; not part of either workspace
└── .switchboard/          multi-session coordination metadata; not application code
```

## Architecture

### Backend: one direction, four layers

```
routes/  →  services/  →  repositories/  →  store/
  ↑ HTTP only    ↑ rules only   ↑ arrays only   ↑ bytes only
```

Routes parse input with a zod schema, call one service method, and send the
result. They never touch a stored record. Services hold the rules — uniqueness,
ownership, hashing — and never see a `Request` or a status code. Repositories
query and mutate the in-memory arrays. Only `store/jsonStore.ts` knows the data
lives in a file.

That boundary is the point: swapping the JSON snapshot for Postgres means
rewriting `repositories/` against a real client, and nothing above it changes.

Two other rules keep the surface honest:

- **`schemas.ts` is the only place untrusted input becomes typed input.** If a
  value did not come out of a zod parse, a route may not use it.
- **`serializers.ts` is the only place a response body is shaped.** Records
  carry fields that must never ship — `passwordHash`, `usernameKey`,
  `emailKey` — so responses are built by explicit mapping, never by spreading a
  record.

`container.ts` is the composition root: it opens the store, constructs the
repositories and services, and hands the finished object graph to `createApp`.
`createApp` takes an already-built container, which is what lets the test suite
drive the real app on an ephemeral port with an in-memory store.

### Frontend: one direction, four layers

```
pages/  →  state/  →  lib/  →  types/
```

No component calls `fetch`, and nothing above `lib/http.ts` inspects a raw
`Response`. `http.ts` attaches the bearer token, parses JSON, converts the
error envelope into a typed `ApiError`, applies a 15s timeout, and fires
registered `onUnauthorized` handlers on any 401 — so session expiry is handled
once, centrally, rather than in every screen.

`web/src/types/contracts.ts` is a verbatim copy of the agreed cross-session
contracts (`UserProfile v1`, `Favorite v1`). Editing it is a contract break;
everything else about the API lives in `wire.ts`.

## API reference

Base path `/api`. Auth is `Authorization: Bearer <token>`.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{status, uptimeSeconds}` |
| POST | `/api/auth/signup` | – | `{username, email, password, displayName?}` → 201 `{user, token, expiresAt}` |
| POST | `/api/auth/login` | – | `{usernameOrEmail, password}` → `{user, token, expiresAt}` |
| POST | `/api/auth/logout` | ✓ | 204; revokes the presented token server-side |
| GET | `/api/me` | ✓ | `Me` — public fields plus email and profile |
| PATCH | `/api/me/profile` | ✓ | partial: `displayName, bio, avatarUrl, location, links` |
| GET | `/api/me/favorites` | ✓ | `?itemType=&tag=&search=&limit=&offset=` |
| GET | `/api/me/favorites/types` | ✓ | `{data: [{itemType, count}]}`, for filter UIs |
| POST | `/api/me/favorites` | ✓ | `{itemType, itemId, title?, url?, note?, tags?}` → 201 |
| GET | `/api/me/favorites/:id` | ✓ | one `Favorite` |
| PATCH | `/api/me/favorites/:id` | ✓ | partial: `title, url, note, tags` |
| DELETE | `/api/me/favorites/:id` | ✓ | 204 |
| GET | `/api/users/:username/profile` | – | public `{user, profile}` — never includes email |
| GET | `/api/users/:username/favorites` | – | public, same envelope and filters as above |

Usernames resolve case-insensitively.

**List queries.** `limit` defaults to 25 (max 100), `offset` to 0. `itemType`
and `tag` are exact matches; `search` is a case-insensitive substring match
against `title`, `note` and `itemId`. Results are newest-first by `createdAt`,
and `total` counts all matches before pagination.

### Response shapes

Lists are enveloped and errors are uniform, everywhere:

```jsonc
{ "data": [ /* Favorite */ ], "total": 12, "limit": 25, "offset": 0 }

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body or query is invalid.",
    "details": [ { "path": "password", "message": "Password must be at least 8 characters." } ]
  }
}
```

| Code | Status | Raised when |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | a zod parse failed; `details` is `[{path, message}]` |
| `INVALID_JSON` | 400 | the body was not parseable JSON |
| `UNAUTHORIZED` | 401 | missing, malformed, unknown or expired token; bad credentials |
| `FORBIDDEN` | 403 | authenticated but not allowed |
| `NOT_FOUND` | 404 | no such route, user, or favorite you own |
| `CONFLICT` | 409 | username/email taken, or a duplicate favorite (`details.favoriteId`) |
| `TOO_MANY_REQUESTS` | 429 | auth rate limit hit; a `Retry-After` header comes with it |
| `INTERNAL_ERROR` | 500 | anything unhandled — the real error is logged, never returned |

Every failure passes through the single error handler in
`middleware/errorHandler.ts`, so there is no path that produces a differently
shaped error body.

## Data model

Four record types live in the store; four wire types leave the server.

```
UserRecord      id, username, usernameKey, email, emailKey, passwordHash, createdAt, updatedAt
ProfileRecord   userId, displayName, bio, avatarUrl, location, links[], updatedAt
FavoriteRecord  id, userId, itemType, itemId, title, url, note, tags[], createdAt, updatedAt
SessionRecord   token, userId, createdAt, expiresAt
```

```ts
PublicUser  = { id, username, createdAt }
UserProfile = { userId, displayName, bio, avatarUrl, location, links, updatedAt }
Me          = PublicUser & { email, profile: UserProfile }
Favorite    = { id, userId, itemType, itemId, title, url, note, tags, createdAt }
```

`usernameKey` and `emailKey` are lowercased copies used for case-insensitive
lookup and uniqueness; they exist only in storage. `passwordHash` never leaves
the process. Ids are UUIDs, timestamps are ISO 8601 strings.

## Validation rules

From `src/server/schemas.ts` — all strings are trimmed before checking:

| Field | Rule |
| --- | --- |
| `username` | 3–30 chars, `[A-Za-z0-9_-]` only |
| `email` | valid email address |
| `password` | 8–200 chars (no composition requirements) |
| `displayName` | 1–80 chars |
| `bio` | up to 500 chars |
| `avatarUrl`, `url` | valid URL, or `null` |
| `location` | up to 100 chars, or `null` |
| `links` | at most 10, each `{label: 1–40 chars, url: valid URL}` |
| `itemType` | 1–40 chars, `[A-Za-z0-9_-]` only |
| `itemId` | 1–200 chars |
| `title` | up to 200 chars, or `null` |
| `note` | up to 1000 chars, or `null` |
| `tags` | at most 20, each 1–40 chars, de-duplicated on write |
| `limit` / `offset` | integers; `limit` 1–100 (default 25), `offset` ≥ 0 |

Both PATCH endpoints reject an empty body — a patch must change at least one
field. Request bodies are capped at 100 kB by `express.json()`.

## Auth and security

**Tokens are opaque and server-side.** `newToken()` is 256 bits of CSPRNG
randomness, base64url-encoded — not a JWT, and carrying no claims. Sessions are
rows in the store, so `POST /api/auth/logout` is a real revocation rather than a
client dropping a string. Sessions last 7 days by default
(`SESSION_TTL_HOURS`); expired ones are rejected on read and swept hourly by a
background interval in `index.ts`.

**Passwords use scrypt** with a fresh 16-byte salt per user, stored as
`scrypt$<salt>$<key>`, and verified with `timingSafeEqual`.

**Login does not leak which usernames exist.** When the account is not found,
the service still verifies against a decoy hash, so the response time of an
unknown user matches that of a wrong password — and both return the same 401
body.

**Ownership failures return 404, not 403.** Asking for someone else's favorite
is indistinguishable from asking for one that does not exist, so ids stay
unguessable.

**Auth endpoints are rate limited** per client IP — a fixed window, 20 attempts
per 15 minutes by default, on signup and login. It is a `Map` in process
memory: enough to blunt credential stuffing against one instance, and something
that must move to a shared store (Redis) before running more than one.

**CORS** is an explicit allowlist (`CORS_ORIGINS`). The default `*` reflects
whatever `Origin` is sent, which is convenient in development and wrong in
production. `x-powered-by` is disabled.

Also worth stating plainly, since this is a demo-scale system: there is no
email verification, no password reset, no rotation of tokens on privilege
change, and no CSRF defence beyond the fact that tokens live in `localStorage`
and travel in a header rather than a cookie.

## Persistence

`JsonStore` holds the entire database in memory and snapshots it to `DATA_FILE`
(default `data/db.json`) after every mutation. Writes go to a temp file and are
then `rename()`d over the target, so a crash mid-write cannot truncate the live
file, and commits are serialised through a promise chain so two snapshots never
interleave.

Set `DATA_FILE=` (empty) for a throwaway in-memory database — that is what the
test suite does. The `data/` directory is gitignored.

This is a **single-process design**. Two instances pointed at one file will
overwrite each other's state; there is no locking and none is planned. It exists
so the layering above can be built and tested without a database, and it is the
first thing to replace.

## Configuration

Backend, via environment or `.env` (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | listen port |
| `HOST` | `127.0.0.1` | bind address |
| `DATA_FILE` | `data/db.json` | JSON snapshot path; empty means in-memory |
| `SESSION_TTL_HOURS` | `168` | token lifetime (7 days) |
| `CORS_ORIGINS` | `*` | comma-separated allowlist, or `*` to reflect any origin |
| `AUTH_RATE_LIMIT_MAX` | `20` | attempts per IP per window on signup/login |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | `15` | the window |
| `TRUST_PROXY` | `false` | honour `X-Forwarded-For` so rate limiting keys on the real client IP |

Frontend, via `web/.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | where the browser sends calls; set it to bypass the proxy |
| `VITE_API_ORIGIN` | `http://127.0.0.1:4000` | where the Vite dev proxy forwards `/api`; read at config time, not in the browser |

**The literal `127.0.0.1` matters.** The backend binds IPv4 specifically, while
`localhost` resolves to `::1` first on current macOS/Node — a proxy target of
`localhost` will `ECONNREFUSED` against a perfectly healthy server. Proxying
rather than pointing the browser at `:4000` also keeps requests same-origin, so
development matches a production deployment behind a single reverse proxy.

## Testing and typechecking

```bash
npm test            # 18 tests, 5 suites, ~0.7s
npm run typecheck   # backend
cd web && npm run typecheck
```

`src/server/app.test.ts` drives the real Express app — built through the real
container, with `DATA_FILE` empty — over HTTP on an ephemeral port. There are no
mocks and no unit tests of individual services; the suites cover health, auth,
profile, favorites and persistence, including duplicate rejection, cross-user
isolation, filter/pagination/count behaviour, payload validation, and a
round-trip through an actual snapshot file.

Both `tsconfig.json`s run `strict` plus `noUncheckedIndexedAccess`, and the
backend adds `erasableSyntaxOnly` — required for Node's type stripping, which
is why the code uses `#private` fields rather than TypeScript `private`, and
never uses enums or parameter properties.

The frontend has no test runner. `npm run build` typechecks before bundling, so
a type error fails the build.

## Behaviour worth knowing

- **Favorites are unique per `(userId, itemType, itemId)`.** A repeat POST is a
  409 whose `details.favoriteId` is the existing row, so the client can link to
  it instead of dead-ending. `lib/http.ts` exposes `conflictFavoriteId()` for
  exactly this, and the add form uses it.
- **`itemType` is caller-defined.** The backend stores whatever namespace the
  frontend picks (`movie`, `article`, …) and never validates it against a list.
  `GET /api/me/favorites/types` reports what a user actually has, with counts.
- **Login takes `usernameOrEmail`**, one field accepting either identifier.
- **Tags are de-duplicated on write**, order otherwise preserved.
- **Public endpoints never include email** — `/api/users/:username/profile`
  returns `{user, profile}` built from `PublicUser`, not `Me`.
- **A 401 drops the frontend session once, centrally**, via `onUnauthorized` in
  `lib/http.ts`. No component handles expiry itself.
- **Network failures and timeouts surface as `ApiError` with `status: 0`**, so
  screens can distinguish "the API said no" from "the API never answered".
- **Shutdown is graceful.** `SIGINT`/`SIGTERM` stops the purge interval, closes
  the server, commits a final snapshot, and force-exits after 5s if a keep-alive
  connection hangs.

## Deployment notes

Neither workspace is production-configured. Before it goes anywhere real:

1. Replace `JsonStore`/`repositories/` with a real database — the layering is
   designed so nothing above `repositories/` changes.
2. Move the rate limiter to a shared store, or drop it in favour of the edge.
3. Set `CORS_ORIGINS` to an explicit list and `TRUST_PROXY=true` behind a proxy
   that sets `X-Forwarded-For`.
4. Serve `web/dist/` and the API from one origin so `/api` stays same-origin,
   matching the dev proxy.
5. Terminate TLS upstream; the server speaks plain HTTP.

## What is deliberately missing

No ORM, no auth library, no data-fetching library, no design system, no CI.
Sessions, hashing, rate limiting, and the fetch/cache bookkeeping in
`web/src/state/useFavorites.ts` are all hand-rolled, which keeps the dependency
list at two production packages on the backend and three on the frontend. If
this grew past a few more screens, TanStack Query would replace most of
`useFavorites.ts`, and the store would be the next thing to go.

For deeper detail on either half, read [`src/server/README.md`](src/server/README.md)
and [`web/README.md`](web/README.md).
