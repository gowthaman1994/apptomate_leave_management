# Quickstart: Validating User Login & Session Authentication

## Prerequisites

- `apps/api`'s venv has the feature's new dependencies installed (`bcrypt==5.0.0`,
  `PyJWT==2.15.1`, `cryptography==46.0.3` pinned per research.md).
- Migration `apps/api/db/migrations/0002_login_lockout.sql` has been applied to the
  `leave_management` database (see data-model.md).
- New env vars are set in `apps/api/.env` (see plan.md Technical Context): a JWT signing
  secret and the Fernet payload-encryption key — both required, no default.
- At least one row exists in `public.users` with a real `bcrypt` hash in
  `hashed_password` (per spec.md's Assumptions — provisioning that row is out of this
  feature's scope; for local validation, insert one directly).
- `uvicorn` is running (`pnpm dev:api` from repo root, or directly per `apps/api/README`).

## Scenario 1 — Successful sign-in (User Story 1, Acceptance Scenario 1)

1. Encrypt `{"email": "<seeded email>", "password": "<its real password>"}` with the
   configured Fernet key (see contracts/auth-api.md for the exact JSON shape).
2. `POST /api/auth/login` with that ciphertext as the raw body.
3. Expect `200` with `access_token` and `refresh_token` present.
4. Call any existing protected-style check (or the planned protected endpoint from a later
   feature) with `Authorization: Bearer <access_token>` and confirm it succeeds.

## Scenario 2 — Wrong password / unknown email are indistinguishable (SC-002)

1. Repeat Scenario 1 step 1–2 with a wrong password for the seeded email → expect `401`
   with the exact generic message from contracts/auth-api.md.
2. Repeat with an email that doesn't exist in `public.users` at all → expect the identical
   `401` body, byte-for-byte, as step 1.

## Scenario 3 — Idle timeout and refresh (User Story 2)

1. Sign in (Scenario 1), capture `refresh_token`.
2. Immediately `POST /api/auth/refresh` with that refresh token → expect `200` with a new
   access/refresh pair.
3. Sign in again fresh, then wait 16+ minutes (or temporarily lower the expiry via env for
   a faster manual check) before calling `/api/auth/refresh` with that run's refresh token
   → expect `401` ("Session expired...").

## Scenario 4 — Deactivated account invalidates an otherwise-valid token (Edge Case 1)

1. Sign in as the seeded user, capture the access token.
2. Directly in the database, set that user's `profiles.status = 'INACTIVE'` (or
   `deleted_at = now()`).
3. Call a protected endpoint with the still-unexpired access token → expect `401`, even
   though the token itself hasn't reached its `exp`.

## Scenario 5 — Lockout after repeated failures (FR-013)

1. Attempt sign-in with the wrong password for the same seeded account 5 times in a row.
2. On the 6th attempt — even with the *correct* password — expect the same generic `401`
   as a wrong password, because `locked_until` is now in the future.
3. Wait past the 15-minute lockout window (or set `API_LOCKOUT_MINUTES=0` in `.env` for a
   faster manual check) and confirm the correct password now succeeds.

## Confirming nothing else broke

- `GET /api/health` and `GET /api/health/db` MUST still return `200 {"status": "ok"}`
  (constitution's Development Workflow & Quality Gates) — these take no request body and
  are untouched by the new encryption dependency.
