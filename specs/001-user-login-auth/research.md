# Research: User Login & Session Authentication

## 1. Password hashing library

**Decision**: `bcrypt==5.0.0`, used directly (no `passlib` wrapper).

**Rationale**: `passlib` is unmaintained (last release 2020) and has a known compatibility
break with `bcrypt>=4.1` (its version-string probe fails against newer bcrypt releases).
`argon2-cffi` (OWASP's current top pick) depends on `argon2-cffi-bindings`, whose newest
release ships **no macOS x86_64 wheel at all** — only `macosx_11_0_arm64` — which would force
a from-source build on this project's Intel development machine (the same class of problem
hit earlier with `cryptography`/Homebrew on this machine). `bcrypt==5.0.0` ships a
`macosx_10_12_universal2` wheel for `cp38-abi3`, installs cleanly on both Intel and Apple
Silicon, requires no wrapper library, and remains an industry-accepted choice for password
hashing (cost-factor tunable, battle-tested).

**Alternatives considered**:
- `passlib[bcrypt]` — rejected: unmaintained, breaks on current bcrypt.
- `argon2-cffi` — rejected for this environment: no Intel macOS wheel in its current
  bindings release; would require a from-source build this project has already hit real
  friction with (see constitution v1.x history re: `cryptography`/Homebrew).

## 2. Token format and library

**Decision**: `PyJWT==2.15.1`, algorithm `HS256` (symmetric), no `[crypto]` extra.

**Rationale**: This is a single-backend system — there is no second party that needs to
verify tokens with a public key, so asymmetric signing (RS256/ES256) adds complexity with no
benefit. `HS256` needs only a shared secret already held by the issuing/verifying service
(the API itself), avoiding a dependency on `cryptography` for this piece entirely. `PyJWT`
without the `[crypto]` extra is a pure-Python package, sidestepping any platform-wheel
concerns.

**Alternatives considered**:
- `python-jose` — rejected: less actively maintained, has had CVEs in its crypto backends.
- RS256/ES256 — rejected: unnecessary asymmetric complexity for a system with one verifier.

## 3. Access/refresh token design (maps to FR-005–FR-009)

**Decision**: Fully stateless JWTs, two token types distinguished by a `type` claim:
- **Access token**: `type: "access"`, 15-minute expiry, sent as `Authorization: Bearer`
  on every protected request. Never trusted for authorization decisions beyond identity
  (`sub` = user id) — role/ownership checks still go through the database's existing RLS
  (constitution Principle II), not token claims.
- **Refresh token**: `type: "refresh"`, also a 15-minute expiry from the moment it was
  issued. `POST /api/auth/refresh` accepts a still-valid refresh token and returns a brand
  new access token *and* a brand new refresh token (both tokens' clocks reset). An expired
  or invalid refresh token is rejected outright (FR-009) — there is no "almost expired"
  grace extension.

This directly implements "refresh after 15 minutes of inactivity" as a sliding window: as
long as the frontend calls `/api/auth/refresh` before the current refresh token's 15-minute
mark elapses, the user's session effectively continues forever without re-entering
credentials; once that window is missed, the refresh token's own signature/`exp` check fails
and sign-in is required again. No server-side session table is needed — claims plus
signature verification are sufficient, consistent with the constitution's preference for
small, direct implementations over speculative generality.

**Alternatives considered**:
- A DB-backed `sessions` table (id, user_id, last_active_at) — rejected: the one thing it
  would buy (immediate server-side revocation on deactivation) is already achieved more
  simply by re-checking `profiles.status`/`deleted_at` on every protected request (see §4),
  which the system has to do anyway to drive RLS. A sessions table would add write load on
  every single request for no additional capability this feature needs.
- Sliding access-token expiry extended by ordinary API calls — rejected: would require
  every protected response to carry a freshly-reissued token, an unusual REST pattern; the
  explicit refresh endpoint the user asked for is the simpler, more conventional mechanism.

## 4. Enforcing account status on an otherwise-valid token (maps to the first Edge Case)

**Decision**: The auth dependency re-queries `public.profiles` (status, `deleted_at`) by the
token's `sub` on *every* protected request, after verifying the JWT's signature and
expiry, and rejects if the profile is `INACTIVE` or soft-deleted — independent of whether
the token itself is still within its validity window.

**Rationale**: This is the same lookup the request already needs to set the
`app.user_id` RLS session variable (constitution Principle II), so it costs nothing extra
and closes the gap a purely stateless token design would otherwise leave open.

## 5. Brute-force mitigation (maps to FR-013)

**Decision**: Two new columns on `public.users` — `failed_login_attempts integer NOT NULL
DEFAULT 0` and `locked_until timestamptz` — added via an additive migration file
(`apps/api/db/migrations/0002_login_lockout.sql`), consistent with this project's existing
"additive SQL files" schema-change policy. On a failed attempt, increment the counter; at 5
consecutive failures, set `locked_until = now() + interval '15 minutes'` and reset the
counter. On success, reset the counter to 0. While `locked_until > now()`, sign-in is
rejected with the *same* generic message used for any other failure (FR-003/SC-002) — a
locked account must not be distinguishable from a wrong password from the outside.

**Rationale**: An in-memory counter would reset on every process restart and wouldn't be
shared across multiple API worker processes — not "proper" protection, just an illusion of
one. A persisted counter is correct regardless of process topology. Reusing the 15-minute
figure already established for session idle timeout is a deliberate consistency choice, not
a technical requirement — it keeps the one numeric constant in this feature memorable
rather than introducing a second, unrelated magic number.

**Alternatives considered**: In-memory/process-local counters — rejected for the reason
above. A dedicated external rate-limiter (Redis, etc.) — rejected as over-scoped for this
feature's actual requirement; nothing else in this project currently needs shared cache
infrastructure.

## 6. Request payload encryption (maps to FR-010/FR-011, resolved via `/speckit-specify`
clarification)

**Decision**: `cryptography==46.0.3`'s `Fernet` symmetric scheme. The shared key is a
32-byte value (base64-encoded, as `Fernet.generate_key()` produces — directly matching the
original "32-bit... clarify format" request, correctly resolved to 32 *bytes*, i.e.
AES-128 + HMAC-SHA256 under Fernet's construction, since a literal 32-bit key would be
cryptographically trivial to brute-force). Applied as a FastAPI dependency on the two new
auth endpoints specifically (`/api/auth/login`, `/api/auth/refresh`), not as global
middleware across the whole API — this feature's scope is the login/session surface only;
extending it to every existing endpoint is a separate decision for later.

**Rationale**: `cryptography==46.0.3` is the newest release that still ships a working
Intel-macOS wheel (`universal2`) — versions after it dropped macOS x86_64 entirely, the same
constraint already documented in this project's dependency history. Fernet is a complete,
authenticated (encrypt-then-MAC) scheme with a simple key format, avoiding hand-rolled AES
mode/IV/padding decisions. As resolved during specification, this key is known to both
frontend and backend (the frontend receives it via its own build-time configuration), so it
is understood as payload obfuscation layered on top of HTTPS, not an independent secret —
documented plainly rather than overstated.

**Alternatives considered**: Raw AES-GCM via `cryptography`'s low-level primitives —
rejected: more footguns (nonce reuse, no built-in format) for no benefit over `Fernet` given
the key is not actually secret from a sufficiently motivated client-side observer anyway.

## 7. Where encryption is applied in the request lifecycle

**Decision**: A FastAPI dependency (not Starlette middleware) that reads the raw request
body, Fernet-decrypts it, and returns the parsed JSON as a plain `dict` for the route
handler to validate into its own Pydantic model. Declared explicitly on the two new routes
only.

**Rationale**: Keeps the blast radius of this change confined to the new routes; the
existing `GET /api/health` and `GET /api/health/db` endpoints (which the constitution
requires stay passing on any change touching `app/main.py`/`app/core`) are untouched by
this mechanism, since they take no request body and aren't decorated with it.
