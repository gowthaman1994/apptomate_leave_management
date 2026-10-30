# Implementation Plan: User Login & Session Authentication

**Branch**: `001-user-login-auth` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-user-login-auth/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add email/password sign-in to `apps/api`, with `bcrypt`-hashed passwords, a stateless
JWT access/refresh token pair governing a 15-minute sliding idle timeout, a shared-key
(Fernet) encryption step on the two new auth endpoints' request bodies per the resolved
spec clarification, and a persisted failed-attempt lockout — all layered on top of the
existing `public.users`/`profiles`/`user_roles` schema and its RLS/`app_user` model. No
sign-up, no password reset, no frontend UI — backend/API only, per spec scope.

## Technical Context

**Language/Version**: Python 3.12 (existing `apps/api` venv; `pyproject.toml` already
requires `>=3.10`)

**Primary Dependencies**: FastAPI 0.162.0, SQLAlchemy 2.1.6, psycopg[binary] 3.3.6
(all existing) + new: `bcrypt==5.0.0`, `PyJWT==2.15.1`, `cryptography==46.0.3`,
`email-validator==2.3.0` (the last required by `pydantic.EmailStr`, discovered during
implementation) — see research.md §1, §2, §6 for why these exact versions/choices

**Storage**: PostgreSQL 15 (existing `leave_management` database), extended with one
additive migration on `public.users` (data-model.md)

**Testing**: `pytest` + `httpx2` (dev dependencies in `apps/api/pyproject.toml`; `httpx2`
replaced the originally-planned `httpx` during implementation after Starlette's
`TestClient` deprecated `httpx` in favor of it on this FastAPI/Starlette version) —
this feature is what first exercises them; function-level tests for
hashing/token helpers, module-level tests for the auth router, workflow-level tests for
full login→protected-call→refresh→expiry sequences, per constitution Principle VII

**Target Platform**: same as existing `apps/api` — local dev server via `uvicorn`, no new
deployment target introduced

**Project Type**: web application (existing monorepo: `apps/web` + `apps/api`) — this
feature touches `apps/api` only

**Performance Goals**: no new goals beyond spec's SC-001 (sign-in + first protected call
under 5s end-to-end on a typical connection) — not a high-throughput concern at this stage

**Constraints**: JWT signing secret and Fernet payload key MUST come from environment
config with no default value (constitution's Security & Secrets section — a hardcoded
default for either would itself be the leaked secret); both are new required fields on
`app/core/config.py`'s `Settings`

**Scale/Scope**: single-tenant internal tool scale (per existing project context) — no
specific concurrent-user target specified or needed for this feature

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle/Section | Check | Status |
| :--- | :--- | :--- |
| I. Frontend/API separation | Backend-only feature; no `apps/web` changes | PASS |
| II. DB-enforced authorization | Auth dependency re-checks `profiles.status`/`deleted_at` per request and calls the existing `set_current_user()` (`SET LOCAL app.user_id`) before any RLS-protected query; token claims alone never grant access | PASS |
| III. Pinned, verified dependencies | `bcrypt==5.0.0`, `PyJWT==2.15.1`, `cryptography==46.0.3` all verified against live PyPI metadata, including macOS x86_64 wheel availability on this dev machine (research.md) | PASS |
| IV. Reproducible, documented local environment | No new system-level tooling required; only new Python packages and two new required env vars, to be added to `apps/api/.env.example` during implementation | PASS |
| V. Spec-driven workflow | This plan follows `/speckit-specify` → `/speckit-plan`; `/speckit-tasks` and `/speckit-implement` still to come | PASS |
| VI. Linting & code smell discipline | New modules (`app/core/security.py`, `app/api/routes/auth.py`, `app/api/deps.py`, `app/schemas/auth.py`) must pass `ruff` with zero errors before done; enforced at implementation time, not by this plan itself | PASS (deferred to implementation) |
| VII. Proactive, multi-level test coverage | Testing strategy above names all three levels explicitly; `/speckit-tasks` must generate concrete test tasks at each level | PASS (deferred to tasks/implementation) |
| Security & Secrets (no hardcoding) | JWT secret and Fernet key both required, no default, sourced from env; the Fernet key's dual-sided nature (frontend also holds it) is documented as a deliberate, bounded exception already resolved during `/speckit-specify`, not a new violation | PASS |
| Dev Workflow & Quality Gates | `GET /api/health`/`GET /api/health/db` must keep passing (verified in quickstart.md); no version ships with a failing test suite | PASS (deferred to implementation/CI) |

No violations requiring justification — **Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/001-user-login-auth/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── auth-api.md       # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/
├── app/
│   ├── main.py                    # existing — add: include the new auth router
│   ├── core/
│   │   ├── config.py              # existing — add: jwt_secret_key, jwt_token_minutes,
│   │   │                            payload_encryption_key (all required, no default)
│   │   ├── db.py                  # existing (set_current_user already present — reused, not changed)
│   │   └── security.py            # NEW — password hashing (bcrypt), JWT encode/decode,
│   │                                Fernet encrypt/decrypt helpers
│   ├── api/
│   │   ├── deps.py                # NEW — FastAPI dependencies: decrypt_body(),
│   │   │                            get_current_user() (verifies access token, re-checks
│   │   │                            profile status, calls set_current_user())
│   │   └── routes/
│   │       ├── health.py          # existing — unchanged
│   │       └── auth.py            # NEW — POST /api/auth/login, POST /api/auth/refresh
│   └── schemas/
│       └── auth.py                # NEW — LoginRequest, RefreshRequest, TokenResponse
├── db/
│   ├── schema.sql                 # existing — unchanged (migrations are additive, separate files)
│   └── migrations/
│       └── 0002_login_lockout.sql # NEW — adds failed_login_attempts, locked_until to public.users
├── tests/                         # NEW directory — function/module/workflow level (per Principle VII)
│   ├── unit/
│   │   ├── test_security.py       # function-level: hashing, JWT encode/decode, Fernet round-trip
│   │   └── test_deps.py           # function-level: dependency behavior in isolation
│   ├── integration/
│   │   └── test_auth_routes.py    # module-level: the auth router's request/response surface
│   └── workflow/
│       └── test_login_session_flow.py  # workflow-level: login → protected call → refresh → expiry
└── pyproject.toml                 # existing — add new runtime deps + confirm pytest/httpx2 wired to a test script
```

**Structure Decision**: This is the existing monorepo's "web application" shape
(`apps/web` + `apps/api`), already in place — no new top-level projects introduced. This
feature adds files only within `apps/api`, following its existing `app/core` /
`app/api/routes` layering, plus a new `app/schemas` (Pydantic request/response models,
not yet present in the codebase before this feature) and a new `apps/api/tests/`
tree organized by the constitution's three required test levels rather than by a
generic "tests" dump.

## Complexity Tracking

*No entries — Constitution Check above reported no unjustified violations.*
