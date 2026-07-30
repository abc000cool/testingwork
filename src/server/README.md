# User system — backend

Accounts, profiles and favorites. Node 24 + Express 5 + zod, TypeScript run
directly by Node's built-in type stripping (no build step).

```bash
npm install
cp .env.example .env      # optional; defaults are fine for local dev
npm run dev               # http://127.0.0.1:4000
npm test                  # 18 integration tests, in-memory
npm run typecheck
```

## Layout

```
src/server/
  index.ts          bootstrap: listen, session purge, graceful shutdown
  app.ts            express wiring (middleware order, route mounting)
  container.ts      composition root — construct everything, inject downward
  config.ts         environment → typed Config
  types.ts          stored records + wire types (the cross-team contract)
  schemas.ts        zod schemas; the only place request input is trusted
  serializers.ts    record → wire payload (the only place responses are shaped)
  crypto.ts         scrypt password hashing, id/token generation
  errors.ts         AppError + status helpers
  store/            JsonStore — the only code that knows about persistence
  repositories/     data access over the store's arrays
  services/         business rules (auth, profile, favorites)
  middleware/       auth, cors, rateLimit, errorHandler
  routes/           HTTP surface only: parse → call service → send
```

The layering is the point: routes never touch records, services never touch
HTTP, and only `store/` knows where bytes live. Swapping the JSON file for
Postgres means rewriting `repositories/` against a real client — nothing above
it changes.

## Auth

Opaque bearer tokens. `POST /api/auth/signup` and `/login` return
`{ user, token, expiresAt }`; send it back as `Authorization: Bearer <token>`.
Sessions default to 7 days and are stored server-side, so logout is a real
revocation rather than a client-side token drop.

Passwords are scrypt with a per-user salt. Login verifies against a decoy hash
when the account doesn't exist, so timing doesn't reveal which usernames are
real, and both failure modes return the same 401 body.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | – | liveness |
| POST | `/api/auth/signup` | – | `{username, email, password, displayName?}` → 201 |
| POST | `/api/auth/login` | – | `{usernameOrEmail, password}` |
| POST | `/api/auth/logout` | ✓ | 204, revokes the current token |
| GET | `/api/me` | ✓ | `Me` (includes email + profile) |
| PATCH | `/api/me/profile` | ✓ | partial: `displayName, bio, avatarUrl, location, links` |
| GET | `/api/me/favorites` | ✓ | `?itemType=&tag=&search=&limit=&offset=` |
| GET | `/api/me/favorites/types` | ✓ | `{data: [{itemType, count}]}` for filter UIs |
| POST | `/api/me/favorites` | ✓ | `{itemType, itemId, title?, url?, note?, tags?}` → 201 |
| GET | `/api/me/favorites/:id` | ✓ | |
| PATCH | `/api/me/favorites/:id` | ✓ | partial: `title, url, note, tags` |
| DELETE | `/api/me/favorites/:id` | ✓ | 204 |
| GET | `/api/users/:username/profile` | – | public: `{user, profile}`, no email |
| GET | `/api/users/:username/favorites` | – | public, same envelope and filters |

Usernames resolve case-insensitively.

## Response shapes

Lists are enveloped, errors are uniform:

```jsonc
{ "data": [ /* Favorite */ ], "total": 12, "limit": 25, "offset": 0 }

{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "path": "password", "message": "…" } ] } }
```

Codes: `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`.

`Me`, `UserProfile` and `Favorite` are the shapes registered as cross-session
contracts; they live in `types.ts` and are produced only by `serializers.ts`.

## Behaviour worth knowing

- **Favorites are unique per `(userId, itemType, itemId)`** — a repeat POST is
  409 with the existing `favoriteId` in `details`, so the client can link to it.
- **`itemType` is caller-defined.** The backend stores whatever namespace the
  frontend uses (`movie`, `article`, …) and never validates it against a list.
- **Another user's favorite returns 404, not 403**, so ids don't leak.
- **Tags are de-duplicated** on write.
- Signup/login are rate limited per IP (20 per 15 min by default). The limiter
  is in-process — it needs a shared store if this ever runs multi-instance.

## Persistence

`JsonStore` keeps the database in memory and snapshots it to `DATA_FILE`
(default `data/db.json`) after each mutation, writing to a temp file and
renaming so a crash can't truncate the live file. Set `DATA_FILE=` empty for a
throwaway in-memory database. Snapshot writes are serialised, but this is a
single-process design — don't run two instances against one file.
