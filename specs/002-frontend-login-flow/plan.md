# Implementation Plan: Frontend Login Flow

**Branch**: `002-frontend-login-flow` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-frontend-login-flow/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the sign-in screen in `apps/web` (email + password, no sign-up/reset), wire it to
feature 001's `POST /api/auth/login` — including the Fernet-encrypted request body that
endpoint actually requires — and translate every failure mode (wrong credentials, invalid
request, network failure, unrecognized error) into a plain-language toast, never raw
response content. On success, the app switches into an authenticated placeholder state.
Token refresh and any real "authenticated application" beyond that placeholder are
explicitly out of scope per spec.md's Assumptions.

## Technical Context

**Language/Version**: TypeScript 5.6, React 18.3 (both existing in `apps/web`)

**Primary Dependencies**: React 18 + Vite 5 (existing) + new: `sonner==2.0.8` (toast);
Fernet encoding uses only the browser's native Web Crypto API (`crypto.subtle`) — no new
runtime dependency for that (research.md §2, §5)

**Storage**: N/A — no persistence; the authenticated session lives in React context state
only for the current page session (research.md §4)

**Testing**: `vitest==3.2.7` + `@testing-library/react==16.3.3` +
`@testing-library/jest-dom==7.0.1` + `@testing-library/user-event==14.6.8` +
`@testing-library/dom==10.4.2` + `jsdom==30.1.3` (all new — `apps/web` has no test runner
yet); function-level tests for validation/error-mapping/Fernet-encoding, module-level
tests for `SignInForm`'s own rendering/validation behavior, workflow-level tests for the
full submit→success/failure/pending sequences, per constitution Principle VII
(research.md §6)

**Target Platform**: browser, via the existing Vite dev server / build — no new deployment
target

**Project Type**: web application (existing monorepo: `apps/web` + `apps/api`) — this
feature touches `apps/web` only; `apps/api` (feature 001) is consumed as-is, unmodified

**Performance Goals**: no new goals beyond spec's SC-002 (sign-in to authenticated view
under 30s on a typical connection) — not a tight constraint

**Constraints**: `VITE_PAYLOAD_ENCRYPTION_KEY` MUST come from Vite build-time environment
config with no default/fallback value baked into source — it must be the exact same value
as the backend's `API_PAYLOAD_ENCRYPTION_KEY` for anything to decrypt, and there is no safe
default for a value that doubles as a real (if non-secret-by-design) shared key; `apps/web`
has no `.env.example` yet, so one is created by this feature (constitution's Security &
Secrets section, and IV on documenting required env vars)

**Scale/Scope**: a single screen with two states (signed-out / signed-in placeholder); no
routing library introduced (research.md §3)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle/Section | Check | Status |
| :--- | :--- | :--- |
| I. Frontend/API separation | `apps/web` only calls the existing `/api/auth/login` endpoint over HTTP; no direct DB access, no business rules duplicating what the API already enforces | PASS |
| II. DB-enforced authorization | Not directly exercised (login itself is unauthenticated); the session this feature produces holds the access token correctly for whatever future feature calls a protected endpoint | PASS |
| III. Pinned, verified dependencies | `sonner==2.0.8`, `vitest==3.2.7`, `@testing-library/react==16.3.3`, `@testing-library/jest-dom==7.0.1`, `@testing-library/user-event==14.6.8`, `@testing-library/dom==10.4.2`, `jsdom==30.1.3`, plus the new `eslint.config.js` tooling versions — all verified against the live npm registry, including the deliberate `vitest` major-version pin to stay compatible with the existing `vite@^5` (research.md §6) | PASS |
| IV. Reproducible, documented environment | New `apps/web/.env.example` documents `VITE_PAYLOAD_ENCRYPTION_KEY`; README gets a frontend-setup update at implementation time | PASS (deferred to implementation) |
| V. Spec-driven workflow + scope cross-check | Token refresh, sign-out UI, and any real post-login "application" screen are explicitly excluded — checked directly against spec.md's Assumptions rather than assumed; nothing here expands scope beyond spec.md | PASS |
| VI. Linting & code smell discipline | New `eslint.config.js` must run clean on everything this feature adds; no duplicated validation/error-mapping logic (one function per concern, reused) | PASS (deferred to implementation) |
| VII. Proactive, multi-level test coverage | Testing strategy above names all three levels explicitly, including the function-level crypto-correctness test called out in research.md §5 | PASS (deferred to tasks/implementation) |
| VIII. Component reuse & service efficiency | Single `<Toaster/>` instance, one validation module, one error-mapping function, one Fernet encoder — no duplicated logic; the one new hand-written utility (Fernet encoding) is justified in research.md §5 under this principle's own reuse-would-distort exception | PASS |
| IX. Frontend architecture: logic/UI separation & consistent UI | `features/auth/` separates `api.ts`/`validation.ts`/`errors.ts`/`AuthContext` (logic) from `SignInForm.tsx`/`SignInScreen.tsx` (presentation); toast styling comes from the shared `sonner` instance rather than a one-off component | PASS |
| X. Error handling discipline | Every failure path (credential rejection, invalid request, network failure, unrecognized error) has an explicit, named handling branch (data-model.md's `SignInFailureKind`) — none silently swallowed | PASS |
| Security & Secrets | `VITE_PAYLOAD_ENCRYPTION_KEY` required via env, no hardcoded default; this is the same frontend-holds-a-build-time-key design already resolved (not re-opened) in feature 001 | PASS |
| Dev Workflow & Quality Gates | New tests must be wired into `apps/web`'s `test` script (and therefore the root `pnpm test`), not merely exist in the repo, per the v1.5.0 deployment-test-gate amendment | PASS (deferred to implementation) |

No violations requiring justification — **Complexity Tracking is empty.** (The hand-written
Fernet encoder is addressed above as a documented, justified exception under Principle
VIII, not a violation.)

## Project Structure

### Documentation (this feature)

```text
specs/002-frontend-login-flow/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── auth-integration.md  # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── main.tsx                 # existing — unchanged
│   ├── App.tsx                  # existing — becomes the signed-out/signed-in switch,
│   │                              renders <Toaster/> once
│   ├── features/
│   │   └── auth/
│   │       ├── api.ts            # NEW — login(email, password): calls /api/auth/login
│   │       │                       with an encrypted body, parses success/failure
│   │       ├── validation.ts     # NEW — validateEmail(), validatePassword() (pure)
│   │       ├── errors.ts         # NEW — maps a failed login() result to toast text
│   │       │                       per contracts/auth-integration.md's table
│   │       ├── AuthContext.tsx   # NEW — session state, signIn(), pending-request guard
│   │       ├── SignInScreen.tsx  # NEW — page-level: wires AuthContext + SignInForm
│   │       └── SignInForm.tsx    # NEW — presentation only: fields, inline errors, button
│   ├── lib/
│   │   └── fernet.ts             # NEW — encodeFernetToken(key, payload) via Web Crypto
│   └── vite-env.d.ts             # NEW — Vite env typing for VITE_PAYLOAD_ENCRYPTION_KEY
├── tests/                        # NEW directory — function/module/workflow level
│   ├── setup.ts                  # NEW — registers Testing Library's cleanup() in afterEach
│   ├── unit/
│   │   ├── fernet.test.ts        # function-level: encode correctness + backend round-trip
│   │   ├── validation.test.ts    # function-level: validateEmail/validatePassword cases
│   │   └── errors.test.ts        # function-level: every mapLoginFailureToToast case
│   ├── integration/
│   │   └── SignInForm.test.tsx   # module-level: field validation UI, no premature submit
│   └── workflow/
│       └── signInFlow.test.tsx   # workflow-level: success, each failure kind, pending-guard
├── eslint.config.js               # NEW — apps/web has no flat config yet (research.md §7)
├── vite.config.ts                 # existing — add a `test` block for vitest, or a sibling
│                                    vitest.config.ts if cleaner to keep separate
├── .env.example                   # NEW — documents VITE_PAYLOAD_ENCRYPTION_KEY
└── package.json                   # existing — add new deps, real `test`/`lint` scripts
```

**Structure Decision**: Stays within the existing monorepo's `apps/web` — no new top-level
project. Introduces `features/auth/` as the first feature-module directory (logic/UI split
per Principle IX) and `lib/` for the one standalone utility that isn't UI-feature-specific
(the Fernet encoder, which a future feature touching `/api/auth/refresh` would also reuse).
`tests/` mirrors `apps/api`'s existing `unit`/`integration`/`workflow` convention from
feature 001, for consistency across the monorepo.

## Complexity Tracking

*No entries — Constitution Check above reported no unjustified violations.*
