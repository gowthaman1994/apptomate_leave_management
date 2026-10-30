---

description: "Task list for User Login & Session Authentication"
---

# Tasks: User Login & Session Authentication

**Input**: Design documents from `/specs/001-user-login-auth/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included and REQUIRED, not optional — constitution Principle VII ("Proactive,
Multi-Level Test Coverage") mandates function-, module-, and workflow-level tests for new
code in `apps/api`, and plan.md's Technical Context/Project Structure already commits to a
`tests/unit/`, `tests/integration/`, `tests/workflow/` layout for this feature.

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's P1/P2/P3)
to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- All paths are under the repository root `apps/api/`

---

## Phase 1: Setup

**Purpose**: Dependency and project-structure groundwork, before any feature code.

- [X] T001 Add `bcrypt==5.0.0`, `PyJWT==2.15.1`, `cryptography==46.0.3` to the
  `dependencies` list in `apps/api/pyproject.toml` (versions pinned per research.md §1, §2,
  §6) and run `apps/api/.venv/bin/pip install -e ".[dev]"` to install them
- [X] T002 [P] Add `API_JWT_SECRET_KEY`, `API_JWT_TOKEN_MINUTES`, `API_PAYLOAD_ENCRYPTION_KEY`
  to `apps/api/.env.example` with placeholder values and a comment noting none of the three
  has a default (constitution's Security & Secrets section)
- [X] T003 [P] Create the test tree `apps/api/tests/unit/`, `apps/api/tests/integration/`,
  `apps/api/tests/workflow/`, each with an `__init__.py`, per plan.md's Project Structure

**Checkpoint**: Dependencies installed, env vars documented, test tree exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story below depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `apps/api/db/migrations/0002_login_lockout.sql` adding
  `failed_login_attempts integer NOT NULL DEFAULT 0` and `locked_until timestamptz`
  (nullable) to `public.users` (data-model.md), then apply it with
  `psql -p 5432 -U gowthaman -d leave_management -f apps/api/db/migrations/0002_login_lockout.sql`
- [X] T005 Add required `Settings` fields in `apps/api/app/core/config.py`:
  `jwt_secret_key: str`, `jwt_token_minutes: int = 15`, `payload_encryption_key: str` — the
  first and third have **no default value** (plan.md Constraints)
- [X] T006 [P] Implement `hash_password(password: str) -> str` and
  `verify_password(password: str, hashed: str) -> bool` using `bcrypt` in
  `apps/api/app/core/security.py`
- [X] T007 [P] Implement `create_token(user_id: str, token_type: Literal["access",
  "refresh"]) -> str` and `decode_token(token: str, expected_type: str) -> dict` (the latter
  raises on bad signature, expiry, or a `type` claim that doesn't match `expected_type`) in
  `apps/api/app/core/security.py`, using `Settings.jwt_secret_key` and
  `Settings.jwt_token_minutes` for both token types (research.md §2, §3)
- [X] T008 [P] Implement `encrypt_payload(data: dict) -> bytes` and
  `decrypt_payload(ciphertext: bytes) -> dict` using `cryptography.fernet.Fernet` and
  `Settings.payload_encryption_key` in `apps/api/app/core/security.py` (research.md §6)
- [X] T009 [P] Create the `TokenResponse` Pydantic schema (`access_token: str`,
  `refresh_token: str`, `token_type: str = "bearer"`, `expires_in: int`) in
  `apps/api/app/schemas/auth.py` (contracts/auth-api.md)
- [X] T010 Create `apps/api/app/api/routes/auth.py` with an empty `APIRouter` and include it
  in `apps/api/app/main.py` under prefix `/api/auth` (endpoints added per-story below)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Email/Password Sign-In (Priority: P1) 🎯 MVP

**Goal**: A provisioned account can sign in with email + password and receive an
access/refresh token pair; wrong password, unknown email, and a locked account all produce
the identical generic rejection; repeated failures lock the account.

**Independent Test**: Submit a valid email/password pair for a provisioned account and
confirm a token pair is returned; submit a wrong password or unknown email and confirm the
identical generic `401`; submit 5 wrong passwords in a row and confirm the 6th attempt
(even correct) is rejected the same way.

### Tests for User Story 1

> Write these FIRST, confirm they fail before the corresponding implementation task.

- [X] T011 [P] [US1] Function-level test for `hash_password`/`verify_password` round-trip
  and wrong-password rejection in `apps/api/tests/unit/test_security.py`
- [X] T012 [P] [US1] Function-level test for `create_token`/`decode_token` round-trip,
  expiry rejection, and `type`-mismatch rejection in `apps/api/tests/unit/test_security.py`
- [X] T013 [P] [US1] Function-level test for `encrypt_payload`/`decrypt_payload`
  round-trip and rejection of tampered ciphertext in `apps/api/tests/unit/test_security.py`

### Implementation for User Story 1

- [X] T014 [US1] Implement the `decrypt_body` FastAPI dependency in
  `apps/api/app/api/deps.py`: read the raw request body, call `decrypt_payload` (T008), and
  return the resulting `dict`; on any failure raise `HTTPException(400, "...")` with a
  generic message that does not reveal why decryption failed (FR-011)
- [X] T015 [P] [US1] Create the `LoginRequest` Pydantic schema (`email: EmailStr`,
  `password: str`) in `apps/api/app/schemas/auth.py`
- [X] T016 [US1] Implement `POST /api/auth/login` in `apps/api/app/api/routes/auth.py`:
  depend on `decrypt_body` (T014), validate into `LoginRequest` (T015), look up
  `public.users` by email, reject while `locked_until > now()`, call `verify_password`
  (T006); on success reset `failed_login_attempts` to 0 and return a `TokenResponse` (T009)
  built from `create_token` (T007) for both an access and a refresh token; on any failure
  (unknown email, wrong password, or locked) increment `failed_login_attempts` and, at 5,
  set `locked_until = now() + interval '15 minutes'` and reset the counter — in every
  failure case return the identical generic `401` body from contracts/auth-api.md
  (depends on T004, T005, T006, T007, T009, T014, T015)
- [X] T017 [US1] Module-level integration test for `POST /api/auth/login` covering: success,
  wrong password, unknown email (asserting byte-identical response bodies per SC-002), and a
  malformed/tampered encrypted request body (FR-011), in
  `apps/api/tests/integration/test_auth_routes.py`
- [X] T018 [US1] Workflow-level test: 5 consecutive wrong-password sign-in attempts followed
  by a 6th attempt using the *correct* password, asserting the 6th is still rejected
  (FR-013, Edge Case 2) in `apps/api/tests/workflow/test_login_session_flow.py`

**Checkpoint**: User Story 1 is fully functional and independently testable (sign-in alone).

---

## Phase 4: User Story 2 - Session Stays Alive While Active, Expires When Idle (Priority: P2)

**Goal**: An active session can be renewed before its 15-minute window elapses without
re-entering credentials; renewal after that window is rejected.

**Independent Test**: Sign in, call refresh before 15 minutes pass (succeeds, new token
pair returned); sign in again, wait past 15 minutes, call refresh (rejected).

### Tests for User Story 2

- [X] T019 [P] [US2] Function-level test confirming `decode_token` rejects a refresh-type
  token where an access-type token is expected, and vice versa, in
  `apps/api/tests/unit/test_security.py`

### Implementation for User Story 2

- [X] T020 [P] [US2] Create the `RefreshRequest` Pydantic schema (`refresh_token: str`) in
  `apps/api/app/schemas/auth.py`
- [X] T021 [US2] Implement `POST /api/auth/refresh` in `apps/api/app/api/routes/auth.py`:
  depend on `decrypt_body` (T014, reused), validate into `RefreshRequest` (T020), call
  `decode_token(expected_type="refresh")` (T007); on success return a brand-new
  `TokenResponse` (T009) with a fresh access token *and* a fresh refresh token; on
  invalid/expired/wrong-type token return the generic `401` from contracts/auth-api.md
  (depends on T007, T009, T014, T020)
- [X] T022 [US2] Module-level integration test for `POST /api/auth/refresh` covering: valid
  refresh succeeds with a new token pair, an expired refresh token is rejected, and an
  access token presented to this endpoint is rejected (type mismatch), in
  `apps/api/tests/integration/test_auth_routes.py`
- [X] T023 [US2] Workflow-level test: sign in → refresh before the 15-minute window elapses
  (succeeds) → sign in again → refresh after the window has elapsed (rejected, FR-009,
  Edge Case 3) in `apps/api/tests/workflow/test_login_session_flow.py`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Every Protected Action Requires the Same Valid Session (Priority: P3)

**Goal**: A single reusable dependency authenticates every protected endpoint via the
access token, re-checks live account status, and wires up the database's RLS session
variable — demonstrated here on one minimal protected endpoint.

**Independent Test**: Call a protected endpoint with a valid token (succeeds), with no
token (rejected), with an expired/invalid token (rejected), and with a valid-but-now-
deactivated account's token (rejected).

### Tests for User Story 3

- [X] T024 [P] [US3] Function-level test for the `get_current_user` dependency: accepts a
  valid access token, rejects missing/invalid/expired tokens, and rejects a token whose
  account is now `INACTIVE` or soft-deleted, in `apps/api/tests/unit/test_deps.py`

### Implementation for User Story 3

- [X] T025 [US3] Implement the `get_current_user` FastAPI dependency in
  `apps/api/app/api/deps.py`: extract the `Authorization: Bearer` token, call
  `decode_token(expected_type="access")` (T007), look up `public.profiles` by the token's
  user id and reject if `status == 'INACTIVE'` or `deleted_at IS NOT NULL` (Edge Case 1),
  then call the existing `set_current_user(db, user_id)` from `apps/api/app/core/db.py`
  before returning the user's id and email (depends on T007). **Note**: implementing this
  task surfaced a pre-existing bug in `set_current_user` itself — `SET LOCAL app.user_id =
  :user_id` is not valid Postgres syntax (SET does not accept a bind parameter); fixed to
  use `SELECT set_config('app.user_id', :user_id, true)`, which is parameterizable and has
  the same transaction-local scope.
- [X] T026 [US3] Implement `GET /api/auth/me` in `apps/api/app/api/routes/auth.py`,
  protected by `get_current_user` (T025), returning the authenticated user's id and email
  (depends on T025)
- [X] T027 [US3] Module-level integration test for `GET /api/auth/me` covering: valid token
  succeeds, missing/invalid/expired token is rejected, and a token for a now-deactivated
  account is rejected, in `apps/api/tests/integration/test_auth_routes.py`
- [X] T028 [US3] Workflow-level test: sign in → call `GET /api/auth/me` successfully →
  deactivate that account directly in the database → call `GET /api/auth/me` again with the
  same still-unexpired access token and confirm rejection (Edge Case 1), in
  `apps/api/tests/workflow/test_login_session_flow.py`

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T029 [P] Add a `test` script/entry so `pytest apps/api/tests` is a documented,
  single command (constitution's test-gate rule needs something concrete to run)
- [X] T030 [P] Document the three new required env vars and how to run the new tests in
  `apps/api`'s section of the root `README.md`
- [X] T031 Run `ruff check` over every file touched in `apps/api/app/` and
  `apps/api/tests/` and fix all findings (constitution Principle VI — zero errors, no
  weakened config)
- [X] T032 Confirm `GET /api/health` and `GET /api/health/db` still return
  `200 {"status": "ok"}` after all changes above (constitution's Development Workflow &
  Quality Gates)
- [X] T033 Walk through all 5 scenarios in `quickstart.md` manually against a running
  `uvicorn` instance and confirm each matches its documented expected outcome

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational; reuses `decrypt_body` from US1
  (T014) but adds no other dependency on US1's business logic — independently testable on
  its own once a token pair exists to refresh.
- **User Story 3 (Phase 5)**: Depends on Foundational; reuses nothing from US1/US2's route
  handlers (only the shared `security.py`/`db.py` helpers from Phase 2).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T002 and T003 (Setup) can run in parallel.
- T006, T007, T008, T009 (Foundational) touch different functions/files and can run in
  parallel once T005 (Settings fields) is done.
- T011, T012, T013 (US1 tests) can run in parallel with each other.
- T019 (US2 test) can start as soon as T007 exists — doesn't need US1 implemented first.
- T024 (US3 test) can start as soon as T007/T025 groundwork exists.
- T029 and T030 (Polish) can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests for US1, launched together:
Task: "Function-level test for hash_password/verify_password in apps/api/tests/unit/test_security.py"
Task: "Function-level test for create_token/decode_token in apps/api/tests/unit/test_security.py"
Task: "Function-level test for encrypt_payload/decrypt_payload in apps/api/tests/unit/test_security.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — this is the larger lift here,
   since it carries the migration, config, and all of `security.py`).
2. Complete Phase 3 (User Story 1): sign-in works end-to-end, including lockout.
3. **STOP and VALIDATE**: run T017/T018 and quickstart.md Scenarios 1, 2, and 5.
4. This alone is a demonstrable MVP: a backend that authenticates by email/password with
   proper hashing, generic failure responses, and brute-force protection — even before
   refresh or a protected `/me` endpoint exist.

### Incremental Delivery

1. Setup + Foundational → Foundation ready.
2. Add User Story 1 → validate independently → MVP.
3. Add User Story 2 (refresh) → validate independently (quickstart Scenario 3).
4. Add User Story 3 (`get_current_user` + `/api/auth/me`) → validate independently
   (quickstart Scenario 4) — this is also the dependency every *future* protected endpoint
   in the project will reuse.
5. Polish (Phase 6) closes out linting, docs, and the full quickstart pass.

---

## Notes

- [P] tasks touch different files/functions and have no incomplete-task dependency between
  them.
- Tests are written before their corresponding implementation task within each story, per
  constitution Principle VII and this project's test-gate rule — confirm each test fails
  first, then implement.
- US2 and US3 do not depend on each other or on US1's route-handler code (only on shared
  Phase 2 helpers), so they can be built in either order or in parallel once Phase 2 is
  done — the priority order (P1 → P2 → P3) is a delivery preference, not a hard dependency
  past Phase 2.

---

## Phase 7: Convergence

Appended by `/speckit-converge` after assessing the implemented code against spec.md,
plan.md, tasks.md, and the constitution. No CRITICAL findings — ordered MEDIUM first.

- [X] T034 Make the sign-in lockout threshold and duration configurable `Settings` fields
  (e.g. `max_failed_login_attempts: int = 5`, `lockout_minutes: int = 15`) instead of the
  hardcoded `MAX_FAILED_ATTEMPTS`/`LOCKOUT_MINUTES` constants in
  `apps/api/app/api/routes/auth.py`, so quickstart.md's documented instruction to "adjust
  the lockout duration via env" is actually true per quickstart.md (contradicts)
- [X] T035 Add an integration test proving RLS correctly scopes a `current_user_id()`-
  dependent policy (e.g. `public.user_roles`'s "Users can view their own roles") to the
  authenticated user from `get_current_user()`'s access token — not just the
  `profiles.status` gate, which doesn't depend on `current_user_id()` — in
  `apps/api/tests/integration/test_auth_routes.py` or `apps/api/tests/unit/test_deps.py`
  per FR-012 (partial)
- [X] T036 [P] Add a malformed/tampered-encrypted-body test for `POST /api/auth/refresh`,
  mirroring `test_login_rejects_malformed_encrypted_body`, in
  `apps/api/tests/integration/test_auth_routes.py` per SC-006 (partial)
- [X] T037 [P] Update `specs/001-user-login-auth/contracts/auth-api.md` to document the
  422 validation-error response (decrypted-but-malformed request bodies) and
  `GET /api/auth/me`'s actual success response shape (`{"id": ..., "email": ...}`), both
  already present in the running implementation but missing from the contract doc per
  contracts/auth-api.md (partial)

---

## Phase 8: Convergence

Appended by a second `/speckit-converge` pass after Phase 7 was implemented. No
CRITICAL/HIGH/MEDIUM findings this round — all four Phase 7 findings confirmed resolved
in the code; this is the one new gap found, in `plan.md` itself (not checked for drift in
the prior pass).

- [X] T038 Update `specs/001-user-login-auth/plan.md`'s Technical Context: change the
  Testing line's `httpx` to `httpx2==2.16.0` (swapped during implementation after a
  Starlette `TestClient` deprecation warning), and add `email-validator==2.3.0` to the
  Primary Dependencies list (added when `pydantic.EmailStr` required it) — both are
  already in `apps/api/pyproject.toml` but undocumented in plan.md per plan.md Technical
  Context (partial)

---

## Phase 9: Convergence

Appended by a third `/speckit-converge` pass after Phase 8 was implemented. Phase 8's
finding was fixed, but incompletely — one more occurrence of the same stale name was
missed in a different part of the same file.

- [X] T039 Update `specs/001-user-login-auth/plan.md` line 121 (the Project Structure
  file-tree comment on `pyproject.toml`): change "confirm pytest/httpx wired to a test
  script" to say `httpx2` instead of `httpx`, per plan.md Project Structure (partial)
