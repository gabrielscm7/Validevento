# Milestone 3 — Deployment & Build Fixes

**Status:** ✅ COMPLETE  
**Priority:** P1  
**Risk:** MED  
**Effort:** S  
**Sessions:** 1  

---

## Goals

Fix broken CI/CD and clean up dead infrastructure code.

---

## Changes

### Step 1 — Fix GitHub Actions frontend build

**File:** `.github/workflows/deploy.yml`

**Current (broken):**
```yaml
- name: Build
  run: npm run build
```

**Fix — add VITE_API_URL:**
```yaml
- name: Build
  run: npm run build
  env:
    VITE_API_URL: https://api.validevento.com.br
```

### Step 2 — Investigate nginx.conf

**File:** `frontend/nginx.conf`

The file contains `${API_URL}` which is a Docker/env variable placeholder. Railway uses Nixpacks, not Docker, so this substitution never happens.

**Decision needed:**

| Option | Action |
|--------|--------|
| Keep for local Docker deploy | Document when/how nginx.conf is used |
| Keep for reference | Move to `Docs/deprecated/nginx.conf` |
| Delete if truly dead | Remove file |

Document your decision:

```
nginx.conf usage: [USED BY DOCKER / REFERENCE ONLY / DELETED]
Reason: [explanation]
```

### Step 3 — Audit Docker files

**Files to check:**
- `Dockerfile.frontend`
- `Dockerfile.backend`

**Railway production reality:**
- Backend: Nixpacks builds `node src/app.js`
- Frontend: Nixpacks builds `npm run build`, Railway starts `node server.js`

**Decision for each file:**

```
Dockerfile.backend: [USED BY RAILWAY / LOCAL ONLY / DEPRECATED / DELETED]
Dockerfile.frontend: [USED BY RAILWAY / LOCAL ONLY / DEPRECATED / DELETED]
```

### Step 4 — Create deprecated folder (if needed)

If any files are moved to deprecated:

```bash
mkdir -p Docs/deprecated
mv [file] Docs/deprecated/
```

---

## Verification

### Option A: Trigger CI manually

1. Push a test commit to a test branch
2. Check GitHub Actions CI run
3. Verify frontend build succeeds with `VITE_API_URL`

### Option B: Local verification

```bash
# Simulate the build
cd frontend
VITE_API_URL=https://api.validevento.com.br npm run build

# Verify the URL is embedded in built files
grep -r "api.validevento.com.br" dist/
```

### Railway deploy verification

After merge to main, verify:
1. Railway backend deployed successfully
2. Railway frontend deployed successfully
3. `https://api.validevento.com.br/api/health` returns 200
4. `https://www.validevento.com.br` loads correctly

---

## Completion Record

**Status:** ✅ COMPLETE  
**Completed:** 2026-10-14  
**By:** opencode agent

### Changes Made

| File | Action | Reason |
|------|--------|--------|
| `.github/workflows/ci.yml` | EDITED | Fixed `VITE_API_URL`: `https://api.validevento.com` → `https://api.validevento.com.br` (was missing `.br`) |
| `.github/workflows/deploy.yml` | UNCHANGED | Has no `npm run build` step — it only runs `railway up`. Frontend build happens on Railway (Nixpacks), so no GitHub Actions build env is needed here. |
| `frontend/nginx.conf` | MOVED → `Docs/deprecated/` | Only used by `Dockerfile.frontend`; `proxy_pass ${API_URL}` was never substituted (broken). |
| `Dockerfile.frontend` | MOVED → `Docs/deprecated/` | Railway uses Nixpacks (`frontend/railway.json`); image relied on the broken nginx.conf. |
| `Dockerfile.backend` | MOVED → `Docs/deprecated/` | Unreferenced; Railway uses Nixpacks (`backend/railway.json`). |
| `Docs/deprecated/README.md` | EDITED | Recorded the three moved files. |

### Decisions

```
VITE_API_URL fix location: .github/workflows/ci.yml (NOT deploy.yml as the plan stated)
  Reason: deploy.yml has no build step; only ci.yml runs `npm run build`.
nginx.conf usage: REFERENCE ONLY (moved to Docs/deprecated)
Dockerfile.backend: DEPRECATED (moved)
Dockerfile.frontend: DEPRECATED (moved; nginx-based path unused + broken)
```

### CI/CD Verification

- [x] Local build embeds the URL: `VITE_API_URL=https://api.validevento.com.br npm run build` → `greppable` in `dist/assets/*.js`
- [ ] GitHub Actions build passes — **not run** (requires a push; cannot trigger from this environment)
- [ ] Railway backend/frontend deployed — **not run** (requires Railway access)
- [ ] Health check `https://api.validevento.com.br/api/health` → 200 — **not run**

### Notes

- The plan pointed at `deploy.yml`, but the real defect was the malformed URL in `ci.yml`
  (`api.validevento.com` without `.br`). Fixed there; `deploy.yml` was already correct for
  its model (Railway CLI deploy, no local build).
- Production build variables (`VITE_API_URL`) are configured in the Railway dashboard, per
  `Docs/CHECKLIST-DEPLOY-v2.md` — outside repo control.
- Nothing in the repo (CI, `docker-compose.yml`, or Railway config) referenced the three
  moved Docker/nginx files; `docker-compose.yml` uses stock `node:20-alpine` images.
- Recorded in place rather than overwriting `Docs/HANDOFF-MILESTONE4.md`.

---

➡️ **Milestone 4: Code Quality & Test Coverage**
