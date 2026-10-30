# Apptomate Leave Management

Monorepo with a React 18 frontend and a FastAPI backend.

```
apps/
  web/   React 18 + Vite + TypeScript, runs on Node 22
  api/   FastAPI 0.162.0, runs on Python 3.10+
```

## Prerequisites

- Node.js 22 (`.nvmrc` pins this; `nvm use` if you have nvm installed)
- pnpm (`corepack enable` will pick up the `packageManager` field, or `npm i -g pnpm`)
- Python 3.10+ (FastAPI 0.162.0 requires it)

> This machine currently has neither Node nor a Python version >=3.10 installed,
> and no Homebrew either, so nothing here has been installed or run yet — only
> scaffolded. See "Local setup" below.

## Local setup

### 1. Frontend (apps/web)

```bash
corepack enable        # one-time, enables pnpm via packageManager field
pnpm install
pnpm dev:web            # starts Vite on http://localhost:5173
```

Required env var in `apps/web/.env` (see `.env.example`) — `VITE_PAYLOAD_ENCRYPTION_KEY`,
which must be the exact same value as the backend's `API_PAYLOAD_ENCRYPTION_KEY`. No
default is provided; sign-in cannot work without it, since the frontend encrypts its
login request body with this key and the backend decrypts with the same one.

### 2. Backend (apps/api)

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Required env vars in `apps/api/.env` (see `.env.example` for the full list, including
format notes) — `API_DATABASE_URL`, `API_JWT_SECRET_KEY`, `API_JWT_TOKEN_MINUTES`,
`API_PAYLOAD_ENCRYPTION_KEY`. The last two have no default: the app refuses to start
without them, since a working default for a secret would itself be the leaked secret.

### Testing

```bash
pnpm test:api          # pytest apps/api/tests — unit, integration, and workflow levels
pnpm --filter web test  # vitest apps/web/tests — unit, integration, and workflow levels
pnpm test              # everything (web + api), via turbo + test:api
```

Backend tests require a running local PostgreSQL (see below) with the schema and
migrations applied — tests create and clean up their own rows against the real
`leave_management` database; there is no separate test database yet. Frontend tests run
against `jsdom`, with `fetch` mocked per test — they don't need a running backend.

### 3. Run both together

From the repo root, once both are set up:

```bash
pnpm install
pnpm dev
```

This runs the Vite dev server and uvicorn side by side (via `concurrently`).
Vite proxies any `/api/*` request to `http://localhost:8000`, so the frontend's
sign-in screen (`apps/web/src/features/auth/`) can call `/api/auth/login` directly.

## Installing missing tooling on this machine

No Homebrew is installed. Options:

- Node 22: install via the official installer at nodejs.org, or install nvm
  first (`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`)
  then `nvm install 22`.
- Python 3.10+: install via the official python.org installer, or pyenv
  (`curl https://pyenv.run | bash`) then `pyenv install 3.12.7`.
