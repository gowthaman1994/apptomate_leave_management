# Quickstart: Validating the Frontend Login Flow

## Prerequisites

- `apps/api` running (feature 001) with a seeded account (see that feature's
  quickstart.md) and `API_PAYLOAD_ENCRYPTION_KEY` set in `apps/api/.env`.
- `apps/web`'s `.env` has `VITE_PAYLOAD_ENCRYPTION_KEY` set to **the exact same Fernet key**
  as the backend's `API_PAYLOAD_ENCRYPTION_KEY` — this is the one shared value both sides
  must agree on for anything to decrypt (research.md §5).
- `pnpm install` run at the repo root (pulls in the new test/lint/toast dependencies).

## Scenario 0 — Cross-language crypto sanity check (do this first)

Before trusting any UI test, confirm the hand-written Fernet encoder
(`src/lib/fernet.ts`) actually produces tokens the real backend accepts:
1. In a scratch script or test, call the encoder with the same key as the running backend
   and a small JSON payload.
2. POST the resulting bytes directly to the running `apps/api`'s `/api/auth/login` (e.g.
   via `curl --data-binary`), the same way feature 001's own quickstart.md validated the
   Python side.
3. Confirm the backend responds with a normal `401`/`200` (proving it decrypted the body),
   not a `400` (which would mean the token format is wrong).

## Scenario 1 — Successful sign-in (User Story 1)

1. Start both servers (`pnpm dev` at the repo root).
2. Open the app; confirm the sign-in screen shows email, password, and a sign-in action,
   with no sign-up or forgot-password link anywhere.
3. Enter a seeded account's email and password, submit.
4. Confirm the screen switches to the authenticated placeholder and no failure toast
   appears.

## Scenario 2 — Field validation blocks submission (User Story 2)

1. Submit with the email field empty → inline error under email, no request sent (check
   the network tab — nothing fires).
2. Enter `not-an-email`, submit → inline error, no request sent.
3. Clear the email error by typing a valid address → error clears without resubmitting.
4. Repeat for an empty password field.

## Scenario 3 — Understandable failure messages (User Story 3)

1. Submit a valid email with a wrong password → toast: "Check your email and password and
   try again." — confirm no raw `401` or JSON body is ever visible anywhere in the UI.
2. Submit an email that isn't a provisioned account → the exact same toast text as step 1
   (SC-005 — must be byte-identical wording).
3. Stop `apps/api`, submit valid-looking credentials → toast: "Can't reach the server.
   Check your connection and try again." — the sign-in screen remains usable (Edge Cases).
4. Restart `apps/api`, confirm a subsequent successful sign-in shows no leftover failure
   toast (Acceptance Scenario 4 of User Story 3).

## Scenario 4 — No duplicate submissions while pending (Edge Cases, FR-007)

1. Throttle the network (devtools) so the request is visibly slow, or temporarily add an
   artificial delay.
2. Click sign-in, then click it again (or press Enter twice) before the first response
   returns.
3. Confirm only one request appears in the network tab, and the button is disabled/shows
   a pending state for the duration.

## Confirming nothing else broke

- `pnpm lint` passes for `apps/web` (constitution Principle VI — this is the first real
  lint run now that `eslint.config.js` exists).
- `pnpm test` passes for `apps/web` (the new `vitest` suite) and still passes for `apps/api`.
- `GET /api/health` and `GET /api/health/db` are untouched by this feature and still return
  `200`.
