# Data Model: Frontend Login Flow

All three entities below are client-side-only TypeScript shapes — nothing here is
persisted; they exist only in memory for the duration of the page session (research.md §4).

## Sign-In Credentials

The values the form collects and sends, decrypted-body shape expected by
`POST /api/auth/login` (feature 001's contract):

```ts
interface SignInCredentials {
  email: string;    // trimmed before validation/send (Edge Case: no leading/trailing whitespace)
  password: string; // sent exactly as entered, never trimmed or transformed (FR-003)
}
```

Validation rules (FR-002, FR-003, Edge Cases):
- `email`: required after trimming; must match a standard email-address format.
- `password`: required after trimming-for-presence-check-only — the value itself, once
  confirmed non-empty, is sent unmodified (leading/trailing whitespace in a password is
  significant and must not be stripped from what's actually sent).

## Authenticated Session

Held in `AuthContext` state only — never written to `localStorage`/`sessionStorage`
(research.md §4):

```ts
interface AuthSession {
  accessToken: string;
  refreshToken: string;
  email: string; // the signed-in account's email, for display only
}
```

State transitions:
- `null` (signed out) → `AuthSession` (signed in): on a successful `POST /api/auth/login`.
- `AuthSession` → `null`: not exercised by any acceptance scenario in this feature (no
  sign-out action is specified) — the type allows it for forward-compatibility but no sign-
  out UI is built here (would be scope not called for by spec.md).

## Sign-In Feedback

Two independent kinds, matching the spec's distinction between field-level guidance and
toast-level service/credential failures. Field errors are plain `string | undefined`
return values from `validateEmail`/`validatePassword` (no wrapping type needed for just
two fields). Toast failures go through `errors.ts`'s `mapLoginFailureToToast`:

```ts
// api.ts
interface LoginFailure {
  ok: false;
  status: number;
  body: unknown;
}

// errors.ts — no exposed "kind" enum; status/network-vs-HTTP is decided inline,
// since the only thing ever needed downstream is the final message string.
type LoginFailureInput = LoginFailure | { kind: "network" };

function mapLoginFailureToToast(input: LoginFailureInput): string;
```

Field errors drive inline messages under each input (User Story 2) and are cleared as
the user edits that field. `mapLoginFailureToToast`'s return value drives the toast shown
via `sonner` (User Story 3) — see contracts/auth-integration.md for the exact
status-to-message table — and is transient, tied to the most recent submit attempt.
