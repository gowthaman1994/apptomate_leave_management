# Research: Frontend Login Flow

## 1. Form state & validation approach

**Decision**: Plain controlled React state + small pure validation functions
(`validateEmail`, `validatePassword`) — no form library (no `react-hook-form`, no `zod`).

**Rationale**: The form has exactly two fields with simple rules (required, email format;
required, no transformation). A form library's value is managing many fields, nested
schemas, and complex cross-field rules — none of which apply here. Constitution Principle
VI already prefers small, direct implementations over speculative generality; adding a
dependency to manage two `useState` calls would be the kind of premature abstraction that
principle warns against.

**Alternatives considered**: `react-hook-form` + `zod` — rejected as disproportionate to
two fields; would also be the first schema-validation dependency in the frontend with
nothing else yet to justify its general adoption.

## 2. Toast notifications

**Decision**: `sonner==2.0.8` (pinned), one `<Toaster />` instance rendered once.

**Rationale**: Toast stacking, auto-dismiss timing, and accessibility (ARIA live regions)
are exactly the kind of UI mechanics that are easy to get subtly wrong by hand — unlike the
form fields, there's real, non-trivial behavior to reuse here rather than reinvent
(Principle VIII). `sonner` is actively maintained (last publish within the last few months
at time of writing), has first-class React 18 support, and is a single small dependency
with no further dependencies of its own.

**Alternatives considered**: hand-rolled toast component — rejected per the reuse rationale
above. `react-hot-toast` — viable alternative, `sonner` chosen for a marginally simpler API
and no meaningful difference otherwise.

## 3. Routing / "authenticated application" state

**Decision**: No routing library. `App.tsx` holds a two-state switch (signed-out →
`SignInScreen`, signed-in → a minimal authenticated placeholder) driven by an `AuthContext`.

**Rationale**: There is nothing else in this codebase to route to yet — no other screen or
feature exists beyond this login flow. Introducing `react-router` (or similar) for a single
true/false switch would be the exact premature-generality Principle VI warns against.
Adding real routing is a reasonable future decision once a second real screen exists.

**Alternatives considered**: `react-router` — rejected as unjustified for a two-state
toggle with nothing else to navigate between right now.

## 4. Session/token storage

**Decision**: Hold `access_token`/`refresh_token` in React context state only (in memory) —
not `localStorage`, not `sessionStorage`. Lost on page reload; that's accepted, not a bug.

**Rationale**: spec.md's Assumptions explicitly state this feature "does not redefine
session expiry or renewal rules" and does not call for persisting sign-in across reloads —
there is no "stay signed in" acceptance scenario. In-memory storage also avoids the token
sitting in a persistent, JS-readable browser store for longer than the current page session,
which is the better default absent an explicit requirement to persist it. Automatic
token refresh (`POST /api/auth/refresh`) is correspondingly **out of scope** for this
feature — the spec's Assumptions say as much directly, and the acceptance scenarios never
exercise a refresh flow.

**Alternatives considered**: `localStorage` persistence + background refresh — rejected as
scope not called for by spec.md; would be exactly the kind of silent scope expansion
Principle V's new scope-cross-check rule exists to prevent. Revisit if a future feature
spec asks for "stay signed in."

## 5. Encrypting the login request body (FR-005's actual integration requirement)

**Decision**: A small, hand-written Fernet-token encoder using the browser's native
`crypto.subtle` (Web Crypto API) — no third-party crypto library.

**Why this is needed at all**: Feature 001 (`001-user-login-auth`)'s resolved design
requires `POST /api/auth/login`'s body to be Fernet-encrypted with a shared key the
frontend holds via build-time config (see that feature's research.md §6 and
contracts/auth-api.md). FR-005 here ("use the existing authentication service... and handle
its successful sign-in result") can only be satisfied by actually producing a request body
the backend's `Fernet(key).decrypt()` accepts — this is integration mechanics required to
call the real existing API, not new scope invented by this plan.

**Investigated and rejected**: the only published npm package for this (`fernet`, latest
0.3.3) calls Node's built-in `require('crypto')` and relies on a Node `Buffer` global at
import time — Vite does not polyfill either for a browser bundle, so using it would require
adding `vite-plugin-node-polyfills` (or a `crypto-browserify` alias) just to load a library
with low recent maintenance activity (11 open issues, 3 open PRs at time of writing). That
polyfill-plus-package combination is more real complexity than writing the token format
directly against a Web API every evergreen browser and Node 22 already implements natively.
This is the Principle VIII exception clause in action: reuse would distort the fit here
(forcing Node internals into a browser bundle), so writing the ~40-line encoder is the
lower-complexity choice, not a violation of "reuse before building new."

**Token format** (must match Python's `cryptography.fernet.Fernet` byte-for-byte, since
that's what decrypts it): given the 32-byte key (base64url-decoded), the first 16 bytes are
the HMAC signing key and the last 16 bytes are the AES key. A token is:
`version(0x80, 1 byte) || timestamp(8 bytes, big-endian Unix seconds) || IV(16 random
bytes) || AES-128-CBC-PKCS7(plaintext) || HMAC-SHA256(version‖timestamp‖IV‖ciphertext)`,
the whole thing base64url-encoded (with `=` padding, matching Python's output). The Web
Crypto API's `AES-CBC` applies PKCS#7 padding automatically, matching Fernet's expectation,
and `crypto.subtle.sign("HMAC", ...)` covers the signature — no manual padding or HMAC
implementation needed, only correct byte-layout assembly.

**Verification requirement carried into tasks**: because this is hand-written
cross-language-compatible crypto code, it must be validated against the real backend, not
just trusted structurally — encode a token in this code, confirm `apps/api`'s
`decrypt_payload()` (from feature 001) actually accepts it, not merely that the JS code
"looks" like it follows the spec. This is captured as an explicit quickstart.md step and a
dedicated test task.

**Alternatives considered**: `fernet` npm package + polyfills — rejected above. Asking the
backend to drop the encryption requirement — out of scope for this plan to decide; that
would be amending feature 001, not implementing feature 002.

## 6. Test runner for `apps/web`

**Decision**: `vitest==3.2.7` (pinned) + `@testing-library/react==16.3.3` +
`@testing-library/jest-dom==7.0.1` + `@testing-library/user-event==14.6.8` +
`@testing-library/dom==10.4.2` + `jsdom==30.1.3`.

**Rationale**: `apps/web` has no test runner at all yet (`package.json`'s `test` script is
a placeholder `echo`) — constitution Principle VII requires function/module/workflow-level
tests for this feature, so standing up a real runner is necessary groundwork, not optional
polish. `vitest` is Vite's own first-party test runner — the natural, lowest-friction choice
for a Vite project (Principle VIII: reuse the existing build tool's own ecosystem rather
than bolting on Jest's separate transform pipeline). **Version note**: `vitest`'s current
major (5.x) requires Vite `^6.4.0 || ^7.0.0 || ^8.0.0`, but `apps/web` is pinned to
`vite@^5.4.10`. Upgrading Vite itself is a separate decision this plan does not make
silently (Principle V) — `vitest@3.2.7` is the latest release still compatible with
`vite@^5`, so it is what's pinned here instead of the newest major.

**Alternatives considered**: upgrading `vite` to 6/7/8 to use `vitest@5.x` — rejected as
out-of-scope infrastructure change for a login-flow feature; `jest` — rejected as a second,
redundant transform/config pipeline alongside Vite's own.

## 7. Linting

**Decision**: Add a flat `eslint.config.js` for `apps/web` using `typescript-eslint`,
`@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and `globals`
(all pinned to their current latest versions, verified against the npm registry).

**Rationale**: `apps/web/package.json` already defines `"lint": "eslint ."`, but no
`eslint.config.js` exists — ESLint 9's flat-config requirement means `pnpm lint` on
`apps/web` currently has nothing to run against. This feature is the first to add real
source code (beyond the placeholder health-check page) and constitution Principle VI
requires zero lint errors on every change, so this gap has to close now, not later.
