# Plan 007: Configure GitHub Actions CI/CD pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- .github/ backend/package.json frontend/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

Currently there is no automated CI/CD pipeline. Changes must be manually tested and deployed. A GitHub Actions pipeline would:
1. Run lint + build on every push to catch errors early
2. Run the single API test suite
3. Enable automatic deployment to Railway on push to main branch
4. Provide visibility into build status

## Current state

- No `.github/` directory exists
- Railway deploys are manual via `railway up` or through Railway dashboard
- No automated tests run on push
- The backend has `npm test` script that runs `node tests/api-test.js`
- The frontend has `npm run lint` script

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Test backend | `cd backend && npm test` | Tests pass |
| Lint frontend | `cd frontend && npm run lint` | No errors |
| Build frontend | `cd frontend && npm run build` | Build succeeds |

## Scope

**In scope**:
- Create `.github/workflows/` directory
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

**Out of scope**:
- Changes to any application source code
- Railway configuration changes (already has `railway.json`)
- Adding new tests

## Git workflow

- Branch: `advisor/007-ci-cd-pipeline`
- Commit message style: `ci: add GitHub Actions workflow for test + deploy`

## Steps

### Step 1: Create CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  backend:
    name: Backend - Lint & Test
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: backend

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: validevento_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run migrations
        run: npm run migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/validevento_test

      - name: Seed test data
        run: npm run seed:test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/validevento_test

      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/validevento_test
          JWT_SECRET: test-secret-key
          NODE_ENV: test

  frontend:
    name: Frontend - Lint & Build
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
        env:
          VITE_API_URL: https://api.validevento.com
```

**Verify**: Check that the file was created at the correct path with valid YAML.

### Step 2: Create deploy workflow (optional — Railway deploy on push to main)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    name: Deploy Backend + Frontend
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm i -g @railway/cli

      - name: Deploy Backend
        working-directory: backend
        run: railway up --service <backend-service-id>
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Deploy Frontend
        working-directory: frontend
        run: railway up --service <frontend-service-id>
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

Service IDs from the Railway project `validevento`:
- Backend service ID: `2df5e0ce-f13a-4b9b-822e-b908e506d027`
- Frontend service ID: `b67f3d4b-d7b3-4cb0-848e-d437766f3fd0`

Replace these in the deploy workflow file before committing.

The `RAILWAY_TOKEN` secret must be added to GitHub repository secrets (Settings > Secrets and variables > Actions > New repository secret).

**Verify**: Check that the file was created at the correct path.

### Step 3: Create AGENTS.md with verification commands

Currently `Agent.md` exists at the repo root. Rename or supplement it with exact CI/CD setup instructions. Since the repo already has `Agent.md` with comprehensive context, just ensure it includes:
- That CI requires a PostgreSQL database
- Environment variables needed for tests

Add to the existing `Agent.md`:

```markdown
## CI/CD

### GitHub Actions
- CI runs on push to main/develop and PRs to main
- Backend: lint + migrate + seed-test + test (requires PostgreSQL)
- Frontend: lint + build (Node.js 20)
- Deploy to Railway on push to main (requires RAILWAY_TOKEN secret)

### Commands de verificação local
```bash
# Backend
cd backend
npm run migrate    # Executa migrations SQL
npm run seed       # Semeia dados básicos
npm run seed:test  # Semeia dados de teste
npm test           # Executa teste API

# Frontend
cd frontend
npm run lint  # ESLint
npm run build # Build de produção
```
```

## Test plan

Verification:
1. Commit and push the workflow files to GitHub
2. Open GitHub > Actions tab
3. Verify the CI workflow triggers and runs successfully
4. Verify both backend and frontend jobs complete

## Done criteria

ALL must hold:
- [ ] `.github/workflows/ci.yml` exists and has valid YAML
- [ ] `.github/workflows/deploy.yml` exists and has valid YAML
- [ ] Agent.md or AGENTS.md includes CI/CD notes
- [ ] Backend CI job: installs deps, runs migration, seeds, runs tests
- [ ] Frontend CI job: installs deps, lints, builds
- [ ] `git status` shows no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts
- The Railway project doesn't have the expected services (check with `railway list-services`)
- The `npm test` script fails locally (fix the test or the code before enabling CI)
- A step's verification fails twice after a reasonable fix attempt

## Maintenance notes

- The RAILWAY_TOKEN must be created from Railway dashboard (Account > Tokens) and added to GitHub secrets
- If services are added/removed from Railway, the deploy workflow must be updated
- The frontend build requires `VITE_API_URL` — this should point to the production backend URL
