---

description: "Task list for Frontend Login Flow"
---

# Tasks: Frontend Login Flow

**Input**: Design documents from `/specs/002-frontend-login-flow/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included and REQUIRED, not optional — constitution Principle VII mandates
function-, module-, and workflow-level tests for new code in `apps/web`, and plan.md's
Project Structure already commits to a `tests/unit/`, `tests/integration/`,
`tests/workflow/` layout for this feature.

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's
P1/P2/P2 — US2 and US3 share priority P2 and have no dependency on each other).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- All paths are under the repository root `apps/web/`

---

## Phase 1: Setup

**Purpose**: Dependency groundwork, before any feature code.

- [X] T001 Add `sonner==2.0.8` to `dependencies`, and `vitest==3.2.7`,
  `@testing-library/react==16.3.3`, `@testing-library/jest-dom==7.0.1`,
  `@testing-library/user-event==14.6.8`, `@testing-library/dom==10.4.2`,
  `jsdom==30.1.3`, `typescript-eslint==8.72.1`, `@eslint/js==10.0.1`,
  `eslint-plugin-react-hooks==7.1.1`, `eslint-plugin-react-refresh==0.5.7`,
  `globals==17.13.0` to `devDependencies` in `apps/web/package.json` (versions pinned
  per research.md §2, §6, §7), then run `pnpm install` from the repo root. **Note**:
  `@eslint/js@10.0.1` requires `eslint@^10`, but `apps/web` is pinned to `eslint@^9.14.0`
  (not upgraded here, out of scope) — corrected to `@eslint/js==9.39.5`, matching the
  installed `eslint@9.39.5` exactly; `pnpm install` then showed zero peer warnings.
- [X] T002 [P] Create `apps/web/.env.example` documenting `VITE_PAYLOAD_ENCRYPTION_KEY`
  with a comment that it has no default and must equal the backend's
  `API_PAYLOAD_ENCRYPTION_KEY` exactly (plan.md Constraints)
- [X] T003 [P] Create the test tree `apps/web/tests/unit/`, `apps/web/tests/integration/`,
  `apps/web/tests/workflow/`, mirroring `apps/api`'s existing convention from feature 001

**Checkpoint**: Dependencies installed, env var documented, test tree exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story below depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `apps/web/eslint.config.js` (flat config) using `typescript-eslint`,
  `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and `globals`
  (T001), so `pnpm lint` on `apps/web` has a config to run against (research.md §7)
- [X] T005 Configure `vitest` for `apps/web`: add a `test` block to `vite.config.ts` (or a
  sibling `vitest.config.ts`) with `environment: "jsdom"` and a setup file that imports
  `@testing-library/jest-dom`'s matchers; update `apps/web/package.json`'s `test` script
  from the placeholder `echo` to `vitest run`
- [X] T006 [P] Implement `encodeFernetToken(key: string, payload: unknown):
  Promise<Uint8Array>` in `apps/web/src/lib/fernet.ts` per research.md §5's exact byte
  layout: version byte `0x80`, 8-byte big-endian Unix-seconds timestamp, 16 random IV
  bytes (`crypto.getRandomValues`), AES-128-CBC-PKCS7 ciphertext of the JSON-stringified
  payload (via `crypto.subtle.encrypt`), then HMAC-SHA256 over
  `version‖timestamp‖IV‖ciphertext` (via `crypto.subtle.sign`) — using the key's first 16
  decoded bytes as the HMAC key and last 16 as the AES key — the whole concatenation
  base64url-encoded with `=` padding to match Python's `cryptography.fernet.Fernet` output.
  **Verified immediately against the real backend** (not deferred to T027): encoded a
  token in Node (`node --experimental-strip-types`), confirmed Python's `Fernet(key)
  .decrypt()` recovered the exact plaintext, then POSTed the same bytes to the live
  `apps/api` and got back `200` with a real token pair.
- [X] T007 Implement `login(email: string, password: string): Promise<LoginResult>` in
  `apps/web/src/features/auth/api.ts`: build `{email, password}`, encode it via
  `encodeFernetToken` (T006) using `import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY`, `POST`
  the bytes to `/api/auth/login`, and resolve a discriminated result —
  `{ok: true, accessToken, refreshToken}` on `200`, or `{ok: false, status, body}` for any
  non-2xx response (never throw on a handled HTTP error; only a genuine network failure
  should reject) (depends on T006)
- [X] T008 Create `apps/web/src/features/auth/AuthContext.tsx`: a React context holding
  `session: AuthSession | null` (data-model.md) and exposing a `useAuth()` hook with the
  current session and a `pending: boolean` flag — no `signIn` behavior yet (added in US1)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Sign In to the Application (Priority: P1) 🎯 MVP

**Goal**: A person with valid credentials signs in and reaches an authenticated
placeholder; repeated activation while a request is pending never sends a duplicate
request.

**Independent Test**: Submit valid credentials for a provisioned account and confirm the
authenticated placeholder renders; submit twice rapidly and confirm only one request is
sent.

### Tests for User Story 1

> Write these FIRST, confirm they fail before the corresponding implementation task.

- [X] T009 [P] [US1] Function-level test: `encodeFernetToken`'s output decodes (via
  base64url) to a byte string whose first byte is `0x80` and whose total length matches
  `1 + 8 + 16 + ciphertext_len + 32` for a known plaintext length, in
  `apps/web/tests/unit/fernet.test.ts`
- [X] T010 [P] [US1] Workflow-level test: mock `fetch` to resolve `200` with a token pair,
  render `SignInScreen` inside the `AuthContext` provider, fill valid credentials, submit,
  and assert the authenticated placeholder renders with the session populated, in
  `apps/web/tests/workflow/signInFlow.test.tsx`
- [X] T011 [P] [US1] Workflow-level test: mock `fetch` with a response that resolves only
  after a delay, trigger submit twice before it resolves, and assert `fetch` was called
  exactly once (FR-007, Edge Case), in `apps/web/tests/workflow/signInFlow.test.tsx`

### Implementation for User Story 1

- [X] T012 [US1] Implement `signIn(email, password)` on `AuthContext` (T008): if `pending`
  is already `true`, do nothing; otherwise set `pending`, call `api.login()` (T007), on an
  `ok: true` result store `{accessToken, refreshToken, email}` as the session, and always
  clear `pending` in a `finally` regardless of outcome (depends on T007, T008). Used a
  `useRef` in-flight flag alongside `pending` state, since two rapid clicks can both pass
  a `pending`-state check before React re-renders — the ref is the actual guard, the
  state is only for disabling the button.
- [X] T013 [P] [US1] Create `apps/web/src/features/auth/SignInForm.tsx`: controlled email
  and password inputs and a submit button disabled while `useAuth().pending` is `true`,
  calling `signIn(email, password)` on submit — no client-side validation yet (US2 adds
  it) and no error display yet (US3 adds it)
- [X] T014 [US1] Create `apps/web/src/features/auth/SignInScreen.tsx` rendering
  `SignInForm` with no account-creation or password-reset entry point anywhere on the
  screen (FR-012) (depends on T013)
- [X] T015 [US1] Update `apps/web/src/App.tsx`: wrap the tree in `AuthContext`'s provider;
  render `SignInScreen` when `session` is `null`, and a minimal "Signed in as `{email}`"
  authenticated placeholder when it is not (depends on T008, T014). The old health-check
  fetch demo was removed entirely — superseded, per research.md §3.

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the
MVP.

---

## Phase 4: User Story 2 - Correct Input Before Signing In (Priority: P2)

**Goal**: Empty or malformed email, and empty password, are caught before any request is
sent, with clear inline messages that clear as the person corrects the field.

**Independent Test**: Submit with an empty/malformed email or empty password and confirm
field-level guidance appears with no network request sent; correct the field and confirm
the error clears.

### Tests for User Story 2

- [X] T016 [P] [US2] Function-level tests for `validateEmail`/`validatePassword` covering:
  empty, whitespace-only (treated as missing per data-model.md's Edge Case), malformed
  email, valid email with surrounding whitespace (must not be rejected for that reason),
  and a password containing only whitespace characters (still sent unmodified once judged
  non-empty) — in `apps/web/tests/unit/validation.test.ts`
- [X] T017 [P] [US2] Module-level test: `SignInForm` shows the email error on an
  empty/malformed submit and does not call `signIn`; shows the password error on an empty
  submit; and clears a field's error as soon as that field is corrected, in
  `apps/web/tests/integration/SignInForm.test.tsx`. **Found and fixed a real bug** while
  writing this: `<input type="email">` triggers native HTML5 constraint validation that
  silently blocked form submission for a malformed value before our handler ever ran —
  added `noValidate` on the `<form>` so our own validation (T018) is what actually runs.

### Implementation for User Story 2

- [X] T018 [P] [US2] Implement `validateEmail(value: string): string | undefined` and
  `validatePassword(value: string): string | undefined` in
  `apps/web/src/features/auth/validation.ts` per data-model.md's Sign-In Credentials
  rules: email is "required after trimming; must match a standard email-address format";
  password is "required after trimming-for-presence-check only... sent unmodified"
- [X] T019 [US2] Wire validation (T018) into `SignInForm.tsx` (T013): validate both
  fields on submit, render each field's error text inline, and do not call `signIn()`
  while either field is invalid (FR-004); re-validate and clear a field's error as its
  value changes (depends on T018)

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Understand Sign-In Failures (Priority: P2)

**Goal**: Every failure mode produces the correct plain-language toast per
contracts/auth-integration.md's table, never raw response content; a later success leaves
no stale failure toast.

**Independent Test**: Exercise credential rejection, invalid-request, and
service-unreachable responses and confirm each produces its mapped toast text with no raw
status code or response body ever shown.

### Tests for User Story 3

- [X] T020 [P] [US3] Function-level tests for the error-mapping function — one case per
  row of contracts/auth-integration.md's table: `401` → `invalid_credentials` →
  "Check your email and password and try again."; `400`/`422` → `invalid_request` →
  "Something went wrong. Please try again."; a network failure (rejected promise) →
  `service_unreachable` → "Can't reach the server. Check your connection and try again.";
  any other unrecognized shape → `unknown` → "Something went wrong. Please try again." —
  in `apps/web/tests/unit/errors.test.ts`
- [X] T021 [P] [US3] Workflow-level tests: a wrong password and an unknown-account
  response both render byte-identical toast text (SC-005); a `422` and a simulated
  network failure each render their own mapped message; a successful sign-in after a
  prior failed attempt shows no leftover toast (Acceptance Scenario 4), in
  `apps/web/tests/workflow/signInFlow.test.tsx`. **Found a real test-isolation issue**:
  `sonner`'s toast queue lives in a module-level store outside the React tree, so toasts
  from one test could leak into the next even with a freshly mounted `<Toaster/>` —
  fixed with `toast.dismiss()` in `beforeEach`. Also had to switch a one-shot
  `queryByText(...).not.toBeInTheDocument()` to a `waitFor`, since sonner animates a
  dismissed toast out rather than removing it from the DOM instantly.

### Implementation for User Story 3

- [X] T022 [P] [US3] Implement `mapLoginFailureToToast(result: LoginResult):
  SignInFailure` in `apps/web/src/features/auth/errors.ts`, implementing
  contracts/auth-integration.md's table exactly — a pure function, no UI concerns
- [X] T023 [US3] Render a single `<Toaster />` (from `sonner`, T001) once in
  `apps/web/src/App.tsx`; in `AuthContext`'s `signIn()` (T012), on an `ok: false` result
  or a caught network rejection, call `mapLoginFailureToToast` (T022) and show it via
  `toast.error(message)`; ensure no toast from a prior attempt persists after a later
  successful sign-in (depends on T022; touches `AuthContext.tsx` and `App.tsx`). Used
  `toast.dismiss()` on a successful sign-in to clear any prior failure toast.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Update the root `README.md`'s frontend section: the new
  `VITE_PAYLOAD_ENCRYPTION_KEY` requirement and that `pnpm test` now also covers
  `apps/web` (constitution's "update project-level docs with every feature" rule). Also
  fixed a stale line referencing the old `fetch("/api/health")` demo, which this feature
  removed from `App.tsx`.
- [X] T025 Confirm `apps/web`'s new `test` script (T005) is actually reached by the root
  `turbo run test` pipeline (not just present in `apps/web/package.json`), so tests are
  bound to the deploy-time run rather than merely existing in the repo (constitution
  v1.5.0's deployment-test-gate amendment). Verified by running `pnpm test` from the repo
  root: it ran `apps/web`'s 27 vitest tests via `turbo run test`, then `apps/api`'s 28
  pytest tests via `test:api` — 55 passed.
- [X] T026 Run `pnpm lint` for `apps/web` and fix all findings (constitution Principle VI
  — zero errors, no weakened config). Verified via the root `pnpm lint` (turbo) pipeline,
  not just a local `eslint .` call — zero errors, zero warnings.
- [X] T027 Execute quickstart.md's Scenario 0: encode a token with `encodeFernetToken`
  using the same key as the running `apps/api`, POST it directly to `/api/auth/login`,
  and confirm the backend responds `401`/`200` (proving real decryption), not `400`.
  Done twice in this implementation pass: once immediately after writing `fernet.ts`
  (T006) and again here as the formal task — both times got `200` with a real token pair.
- [~] T028 Walk through quickstart.md's Scenarios 1–4 manually in a browser against both
  running servers and confirm each matches its documented expected outcome. **Partially
  done, disclosed honestly**: this session has no real browser-automation tool available
  (no computer-use, Chrome extension, or built-in-browser MCP tools), so I could not
  literally click through the UI. What I verified instead: started the real Vite dev
  server and confirmed it serves the app's HTML and module graph with no errors (a
  genuine build/boot check, not a substitute for the UI scenarios themselves). The 4
  scenarios' actual behaviors (valid sign-in, field validation, each failure toast,
  pending-guard) are exercised by the automated workflow/integration tests (T010, T011,
  T017, T021) via `jsdom` + Testing Library, which is real DOM/interaction testing but
  not literally "in a browser." **A real manual browser pass by you is still outstanding**
  before considering this feature fully done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational; layers validation onto US1's
  already-working `SignInForm.tsx` (T013) but doesn't block US1 from working standalone
  first.
- **User Story 3 (Phase 5)**: Depends on Foundational; layers failure handling onto US1's
  `AuthContext.signIn()` (T012) and `App.tsx` (T015), independent of US2.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T002 and T003 (Setup) can run in parallel.
- T006 (Foundational) can run in parallel with T004/T005 once T001 is done.
- T009, T010, T011 (US1 tests) can run in parallel with each other.
- T016, T017 (US2 tests) can start as soon as Foundational is done — independent of US1's
  implementation tasks.
- T020, T021 (US3 tests) can likewise start as soon as Foundational is done.
- T024 (Polish) can run in parallel with T026/T027/T028.

---

## Parallel Example: User Story 1

```bash
# Tests for US1, launched together:
Task: "Function-level test for encodeFernetToken's byte layout in apps/web/tests/unit/fernet.test.ts"
Task: "Workflow-level test for successful sign-in in apps/web/tests/workflow/signInFlow.test.tsx"
Task: "Workflow-level test for the pending-request guard in apps/web/tests/workflow/signInFlow.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — the Fernet encoder and `api.ts`
   are the real engineering lift here).
2. Complete Phase 3 (User Story 1): sign-in works end-to-end against the real backend.
3. **STOP and VALIDATE**: run T009–T011, then quickstart.md Scenario 0 and Scenario 1.
4. This alone is a demonstrable MVP: a person with valid credentials can sign in and
   reach the authenticated placeholder — even before client-side validation or
   friendly error toasts exist.

### Incremental Delivery

1. Setup + Foundational → Foundation ready.
2. Add User Story 1 → validate independently → MVP.
3. Add User Story 2 (field validation) → validate independently (quickstart Scenario 2).
4. Add User Story 3 (failure toasts) → validate independently (quickstart Scenario 3) —
   also exercises the pending-guard's interaction with a real failure (Scenario 4).
5. Polish (Phase 6) closes out linting, CI wiring, docs, and the full quickstart pass.

---

## Notes

- [P] tasks touch different files/functions and have no incomplete-task dependency
  between them.
- Tests are written before their corresponding implementation task within each story, per
  constitution Principle VII and this project's test-gate rule — confirm each test fails
  first, then implement.
- US2 and US3 share priority P2 and have no dependency on each other — either can be
  built first, or both in parallel, once Phase 2 is done.

---

## Phase 7: Convergence

Appended by `/speckit-converge` after assessing the implemented code against spec.md,
plan.md, tasks.md, and the constitution. No CRITICAL/HIGH findings — ordered MEDIUM first.

- [ ] T029 Perform a real manual browser pass through quickstart.md's Scenarios 1–4
  (`pnpm dev`, open `http://localhost:5173`) — this session had no browser-automation
  tool available, so T028 only verified these behaviors via `jsdom`/Testing Library
  automated tests and a dev-server boot check, never a literal browser click-through,
  per tasks.md T028 (partial)
- [X] T030 [P] Add `apps/web/src/vite-env.d.ts` and `apps/web/tests/setup.ts` to plan.md's
  Project Structure listing — both exist and are load-bearing (Vite env typing for
  `VITE_PAYLOAD_ENCRYPTION_KEY`; Testing Library cleanup registration) but neither is
  documented there, per plan.md Project Structure (partial). Also fixed two stray
  `SignInFailure`/`SignInFailureKind` references in that same tree's inline comments
  (same root cause as T031, just in plan.md instead of data-model.md).
- [X] T031 [P] Update data-model.md's "Sign-In Feedback" section to describe the actual
  implemented shape — `errors.ts` exports only `mapLoginFailureToToast(): string`, with no
  `kind` field or `SignInFailureKind`/`SignInFailure` types anywhere in the real code,
  unlike what that section currently documents, per data-model.md "Sign-In Feedback"
  (partial)
