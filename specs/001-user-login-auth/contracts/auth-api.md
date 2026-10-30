# Contract: Auth endpoints (`apps/api`, under `/api/auth`)

All request bodies below are the *decrypted* JSON shape — i.e. what the route handler sees
after the Fernet-decryption dependency (research.md §6–7) has run. On the wire, the actual
HTTP body is the Fernet-encrypted ciphertext of this JSON, sent as the raw request body.

## `POST /api/auth/login`

**Request body** (decrypted):
```json
{
  "email": "person@example.com",
  "password": "their-plaintext-password"
}
```

**Success — 200**:
```json
{
  "access_token": "<jwt, type=access, 15m>",
  "refresh_token": "<jwt, type=refresh, 15m>",
  "token_type": "bearer",
  "expires_in": 900
}
```

**Failure — 401** (wrong password, unknown email, or locked account — all identical):
```json
{
  "detail": "Invalid email or password."
}
```
No field or status distinguishes "account doesn't exist" from "wrong password" from
"account is locked" (FR-003, FR-013, SC-002).

**Failure — 400**: malformed/undecryptable request body (FR-011) — generic message, no
detail about which encryption check failed.

**Failure — 422**: the request body decrypted successfully but doesn't match the shape
above (e.g. a missing `email` or `password` field):
```json
{
  "detail": "Invalid request body."
}
```
This is a distinct failure mode from the 401/400 cases above — it means decryption
succeeded but the plaintext JSON itself was malformed, not a credentials or encryption
problem.

## `POST /api/auth/refresh`

**Request body** (decrypted):
```json
{
  "refresh_token": "<jwt, type=refresh>"
}
```

**Success — 200**: identical shape to login's success response — a brand new access token
*and* a brand new refresh token, both with fresh 15-minute windows (research.md §3).

**Failure — 401**: refresh token missing, expired, invalid signature, or not a refresh-type
token:
```json
{
  "detail": "Session expired. Please sign in again."
}
```

**Failure — 400**: same malformed/undecryptable request body case as login (FR-011).

**Failure — 422**: decrypted body doesn't match the shape above (e.g. missing
`refresh_token`) — same generic `{"detail": "Invalid request body."}` as login's 422 case.

## `GET /api/auth/me`

The minimal concrete endpoint demonstrating the shared `get_current_user` dependency
(below) — the vehicle every other protected endpoint in the project will follow the same
pattern as.

**Success — 200**:
```json
{
  "id": "<uuid>",
  "email": "person@example.com"
}
```

**Failure — 401**: see "Using the access token on other endpoints" below — identical
`{"detail": "Not authenticated."}` body for every rejection case.

## Using the access token on other endpoints

Every existing and future protected endpoint reads:
```
Authorization: Bearer <access_token>
```

**Failure — 401** on any protected endpoint (missing header, expired/invalid token, or the
token's account is now `INACTIVE`/soft-deleted):
```json
{
  "detail": "Not authenticated."
}
```

This is the shared dependency referenced in research.md §4 — it is what every other feature
built on top of this one will depend on (FR-006, FR-012).
