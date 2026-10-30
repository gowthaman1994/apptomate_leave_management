<!--
Sync Impact Report
Version change: 1.4.0 → 1.5.0 (MINOR — three new principles added, two sections expanded)
Modified principles: none renamed; added:
  - VIII. Component Reuse & Service Efficiency (new)
  - IX. Frontend Architecture: Logic/UI Separation & Consistent UI (new)
  - X. Error Handling Discipline (new)
Added sections: none new top-level; "V. Spec-Driven Development Workflow" expanded with a
  scope-document cross-check rule; "Development Workflow & Quality Gates" expanded with
  code-review-at-deployment, tests-wired-into-the-deploy-run, and docs-updated-with-every-
  feature rules
Removed sections: none
Follow-up TODOs: none for this amendment. Carried-over open notes (still non-blocking,
  outside this command's scope): apps/api's `database_url` default and the hardcoded
  bootstrap admin email (both flagged since v1.0.0/v1.4.0) remain unresolved. New note:
  this project has no CI/deployment pipeline yet, so the new "code review during
  deployment" and "tests bound to the deployment run" rules are policy ahead of
  infrastructure — there is nothing to wire them into until one exists.
-->

# Apptomate Leave Management Constitution

## Core Principles

### I. Clear Separation Between Frontend and API
The React 18 frontend (`apps/web`) MUST NOT access the database or any backend service
directly. All data and business logic flow through the FastAPI backend (`apps/api`) over
its versioned REST endpoints under `/api`. The frontend owns presentation and client-side
state only; it holds no database credentials and no business rules that duplicate logic
the API is responsible for.

### II. Database-Enforced Authorization (Defense in Depth)
Row-Level Security MUST stay enabled on every table holding user- or role-scoped data. The
API MUST connect as a non-owner role (`app_user`), never as the table-owning superuser, so
RLS policies actually apply. Any request path that depends on `public.current_user_id()`
MUST set the `app.user_id` session variable via `SET LOCAL` within that request's
transaction before issuing queries. Authorization MUST be checked at both the application
layer and the database layer — neither layer is sufficient on its own, and removing either
check requires an explicit constitution amendment.

### III. Pinned, Verified Dependencies
Every dependency version (Node, Python, npm/pnpm packages, PyPI packages) MUST be pinned to
an exact version that has been verified against the live registry (PyPI, npm) rather than
assumed from training data or memory. Open-ended ranges (`^`, `>=` without an upper bound)
are avoided for primary runtime dependencies in `package.json` and `pyproject.toml` so builds
stay reproducible across machines.

### IV. Reproducible, Documented Local Environment
Any tool required to run this project (Node, pnpm, Python, PostgreSQL) MUST be installable
and documented in `README.md` without assuming Homebrew is present, since the reference
development machine has none and is on an architecture (Intel) that current Homebrew no
longer supports. Setup steps MUST be copy-pasteable commands, not tribal knowledge, and
must name the actual fallback tool used (nvm, pyenv, Postgres.app) when the "normal" path
isn't available.

### V. Spec-Driven Development Workflow
Non-trivial features MUST pass through the Spec Kit workflow — `/speckit-specify` →
`/speckit-plan` → `/speckit-tasks` → `/speckit-implement` — before significant
implementation work begins. This constitution itself is amended only through
`/speckit-constitution`, never by hand-editing `.specify/memory/constitution.md` directly,
so governance changes stay auditable and separate from feature work. Any new enhancement
proposed for a feature that already has a `spec.md` MUST be checked against that spec (the
feature's scope document) before being implemented: work that stays within the documented
scope proceeds normally, but work that would expand it MUST update the spec first (or go
through `/speckit-specify` as a new feature), rather than growing scope silently mid-
implementation.

### VI. Linting & Code Smell Discipline
Every file touched in a change MUST pass its project's linter — ESLint for `apps/web`,
Ruff for `apps/api` — with zero errors before that change is considered done; linter
configuration MUST NOT be weakened (disabled rules, broad ignores, skipped files) merely to
force a pass. Code smells — duplicated logic, dead code, functions doing more than one
thing, unclear naming, premature abstraction — MUST be fixed as they are found rather than
deferred to "later cleanup," consistent with this project's preference for small, direct
implementations over speculative generality. This is a continuous discipline applied on
every change, not a one-time or pre-release pass.

### VII. Proactive, Multi-Level Test Coverage
Unit tests MUST be written for new and changed code in both `apps/web` (React) and
`apps/api` (FastAPI) as part of doing the work itself — proactively, without the user
needing to ask for them each time a change is made. Coverage MUST span three levels:
**function-level** (a single function or component exercised in isolation), **module-level**
(a file's, router's, or hook's public surface, including its interaction with its immediate
collaborators), and **workflow-level** (an end-to-end slice such as "submit a leave request
→ balance deducted → status visible," spanning multiple functions and modules together). A
change is not complete until tests exist at whichever of these levels apply to it. This
principle is what gives the "Development Workflow & Quality Gates" test-gate rule (never
deploy on a failing suite) something real to enforce; it is a build-time discipline, not an
after-the-fact audit.

### VIII. Component Reuse & Service Efficiency
An existing component, module, utility, or query MUST be reused instead of writing a new
one that duplicates its behavior, whenever one already covers the need — this is the same
duplication concern as Principle VI, applied specifically to the choice of whether to
write new code at all. New work MUST also avoid adding unnecessary load to the service:
no redundant database queries or recomputation of a value already available in the current
request/response cycle, no new network calls where an existing one already carries the
needed data. Reuse is a design default, not a mandate to force-fit an ill-suited existing
abstraction — introducing something new is justified when reuse would distort the existing
component's purpose, but that judgment call should be explicit, not accidental.

### IX. Frontend Architecture: Logic/UI Separation & Consistent UI
In `apps/web`, business logic — data fetching, state management, derived calculations, API
calls — MUST live outside presentational components (in hooks, services, or similar), not
inside component bodies; a UI component receives data and callbacks as props and renders
them, without independently deciding business rules. Shared UI (buttons, form fields,
layout primitives, spacing, color usage) MUST be reused from a common set of components
rather than re-implemented per page or feature, so the application reads as one consistent
product rather than a patchwork of independently-styled screens. A new one-off UI pattern
requires a reason, not just convenience.

### X. Error Handling Discipline
Every code path that can fail — I/O, network calls, database access, external service
calls, parsing of external input — MUST handle that failure explicitly rather than letting
it propagate unhandled or swallowing it silently. No bare `except:`/`except Exception:`
that discards the error, and no `catch` block that logs nothing and does nothing. Failures
MUST surface at the right layer: `apps/api` returns a meaningful HTTP status and a message
that doesn't leak internals (consistent with the generic-error patterns already established
for auth), and `apps/web` shows the user real feedback instead of a blank or frozen UI.
This applies uniformly across both apps, not just to the parts of the codebase that happen
to have been reviewed most recently.

## Security & Secrets

Nothing MUST be hardcoded in application code — not credentials, not connection strings,
not URLs (API base URLs, service endpoints, redirect targets), not environment-specific
values of any kind. These MUST always be sourced from environment variables (`.env` files
locally, real environment configuration in deployed environments), with a sane non-secret
default only where a hardcoded fallback cannot leak anything sensitive and genuinely aids
local development. Database credentials and all other secrets MUST live only in untracked
`.env` files, never committed; `.env.example` documents the shape of required variables
without real values. The bootstrap ADMIN account is currently identified by a single
hardcoded email address inside the `handle_new_user` trigger — this is a known interim
shortcut that MUST be replaced with a proper admin-provisioning mechanism before any
production launch, not silently carried forward. No Supabase/Lovable Cloud-specific
primitives (`pg_cron`, `pg_net`, Edge Functions, `auth.uid()`, the `authenticated` role) may
be reintroduced, since this project runs on plain, self-hosted PostgreSQL — equivalent
functionality is implemented as explicit FastAPI background tasks when it's actually built.

## Development Workflow & Quality Gates

Backend changes touching `app/main.py` or `app/core` MUST keep `GET /api/health` and
`GET /api/health/db` returning `200 {"status": "ok"}` before merge. Schema changes are
additive SQL files applied with `psql -f` and reviewed before running; there is no migration
tool (e.g. Alembic) yet — adopting one is a deliberate future decision, not an assumption to
make silently. Non-trivial changes should go through the project's `/code-review` skill
where available before being considered done.

No version of this project MUST be deployed if its unit test suite fails, for either app.
A failing test is a hard release blocker, not a warning: there is no "deploy anyway" override,
and a failure MUST be fixed or the failing test explicitly triaged and resolved (not skipped
or deleted to force a pass) before that version goes out.

Every new module, function, or feature MUST have its corresponding unit tests created
alongside it (per Principle VII) and wired into whatever actually runs at deployment time —
a test that exists in the repo but isn't part of the deploy-time test run does not satisfy
this gate, since an untested path and an unrun test are equally invisible to the release
process. Code review MUST happen as part of every deployment, not as an optional step that
gets skipped under time pressure — no version goes out without having been reviewed.
Whenever a new feature or module is added, the project-level documentation (`README.md`,
and any other docs describing setup, architecture, or usage that the change affects) MUST
be updated in the same change; documentation drift is treated as incomplete work, not a
follow-up to get to later.

## Governance

This constitution supersedes ad hoc conventions wherever they conflict. Amendments MUST be
made via `/speckit-constitution`, which handles placeholder resolution, versioning, and the
Sync Impact Report — direct edits to this file outside that workflow are not permitted.
Versioning follows semantic rules: MAJOR for backward-incompatible principle removals or
redefinitions, MINOR for new or materially expanded principles/sections, PATCH for wording
or clarification fixes. Every `/speckit-plan` run MUST check the proposed plan against the
principles above; any conflict must be resolved or explicitly justified in that plan's
Complexity Tracking section before implementation proceeds.

**Version**: 1.5.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-30
