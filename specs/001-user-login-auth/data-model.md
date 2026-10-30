# Data Model: User Login & Session Authentication

## Existing entities touched (from `apps/api/db/schema.sql`)

### `public.users` (extended by this feature)

| Column | Type | Notes |
| :--- | :--- | :--- |
| id | uuid | PK, existing |
| email | text | existing, unique — the sign-in identifier (FR-001) |
| hashed_password | text | existing — now actually populated/verified via `bcrypt` (FR-002) |
| created_at | timestamptz | existing |
| **failed_login_attempts** | integer | **new**, `NOT NULL DEFAULT 0` — tracks consecutive sign-in failures (FR-013) |
| **locked_until** | timestamptz | **new**, nullable — set when the lockout threshold is hit (FR-013); sign-in is rejected while `now() < locked_until` |

Added via `apps/api/db/migrations/0002_login_lockout.sql` (additive, per constitution's
schema-change policy). No existing column changes type or is removed.

### `public.profiles` (read-only for this feature)

Used after token verification to decide whether an otherwise-valid token should still be
honored:

| Column used | Purpose here |
| :--- | :--- |
| `status` | `INACTIVE` → reject the request (Edge Case 1) |
| `deleted_at` | non-null → reject the request (Edge Case 1) |

No schema changes to `profiles`.

## New concepts (not persisted — carried entirely in signed tokens)

### Access Token (JWT)

| Claim | Type | Meaning |
| :--- | :--- | :--- |
| `sub` | string (uuid) | `users.id` of the authenticated account |
| `type` | string | always `"access"` — distinguishes from a refresh token presented to the wrong endpoint |
| `iat` | int (unix ts) | issued-at |
| `exp` | int (unix ts) | `iat + 15 minutes` |

Not stored server-side. Validity = signature check + `exp` check + (on each protected
request) a live re-check of the corresponding `profiles.status`/`deleted_at`.

### Refresh Token (JWT)

Same shape as the access token, with `type: "refresh"` and its own independent `exp`
(`iat + 15 minutes`). Presenting a refresh token to any endpoint other than
`POST /api/auth/refresh`, or presenting an access token to `/api/auth/refresh`, is rejected
(`type` mismatch).

## Validation rules carried over from requirements

- Email + password are the only two accepted sign-in fields (FR-001) — no other field is
  read from the decrypted login payload.
- A password is never persisted or logged anywhere in plain text (FR-002, SC-004); only
  `bcrypt`'s hash output is stored (already the shape of the existing `hashed_password`
  column).
- Every rejection path for sign-in (wrong password, unknown email, locked account) returns
  the same generic response shape (FR-003, SC-002) — enforced by having exactly one failure
  branch in the login handler, not several differently-worded ones.
