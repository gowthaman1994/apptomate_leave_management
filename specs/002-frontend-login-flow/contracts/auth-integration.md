# Contract: Frontend consumption of `POST /api/auth/login`

This feature doesn't define a new backend contract — it consumes the one feature 001
already built and documented at
`specs/001-user-login-auth/contracts/auth-api.md`. This file covers only what's specific
to the frontend side: the wire-level request mechanics, and the mapping from the backend's
actual responses to this feature's user-facing failure categories (data-model.md's
`SignInFailureKind`).

## Request

`POST /api/auth/login`, body = Fernet-encrypted (research.md §5) ciphertext of:
```json
{ "email": "<trimmed email>", "password": "<password, unmodified>" }
```
sent as the raw request body (not JSON-content-typed — the ciphertext bytes are the body).

## Response → `SignInFailureKind` mapping

| Backend response | `SignInFailureKind` | User-facing message (exact text shown in the toast) |
| :--- | :--- | :--- |
| `200` with `access_token`/`refresh_token` | *(success, no failure)* | — |
| `401 {"detail": "Invalid email or password."}` | `invalid_credentials` | "Check your email and password and try again." |
| `400` (malformed/undecryptable body) | `invalid_request` | "Something went wrong. Please try again." |
| `422` (decrypted body failed validation) | `invalid_request` | "Something went wrong. Please try again." |
| Network error (fetch throws, no response at all) | `service_unreachable` | "Can't reach the server. Check your connection and try again." |
| Any other status/shape not listed above | `unknown` | "Something went wrong. Please try again." |

This table is the single source of truth the error-mapping function
(`features/auth/errors.ts`) implements — one function, one switch, no ad hoc string
matching scattered across components (Principle VIII). Per FR-009/SC-005, the
`invalid_credentials` row is deliberately the *only* row that differs in wording from the
generic fallback, and it still never distinguishes "wrong password" from "unknown email"
(the backend itself already guarantees that — this table just carries it through).

## What this feature does NOT call

`POST /api/auth/refresh` and `GET /api/auth/me` (both documented in feature 001's
contract) are **not** used by this feature — no acceptance scenario here exercises token
refresh or a protected "who am I" call (research.md §4). The `AuthSession` this feature
produces simply holds the tokens for whatever future feature needs them.
