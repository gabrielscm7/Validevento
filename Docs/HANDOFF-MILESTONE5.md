# Milestone 5 — Performance & Scaling Considerations

**Status:** ✅ COMPLETE  
**Priority:** P3  
**Risk:** LOW  
**Effort:** M-L  
**Sessions:** 2-3  

---

## Goals

Evaluate long-term scalability and operational readiness. Each item below is independently decisioned.

---

## Items to Evaluate

### Step 1 — Redis for Rate Limiting

**Current state:** `express-rate-limit` uses in-memory store.

**Question:** Is horizontal scaling on the roadmap?

| Decision | Action |
|----------|--------|
| YES — implement Redis | Add `ioredis`, update rate limiter config |
| NO — document decision | Close as "won't fix" with rationale |

```
Redis decision: [IMPLEMENT / DEFERRED / WON'T FIX]
Reason: [explanation]
```

### Step 2 — PostgreSQL 16 Upgrade Path

```bash
# Check current version on Railway
# (Usually visible in Railway dashboard or via SQL: SELECT version())

# Test locally with PostgreSQL 16
docker compose up -d db  # Update image to postgres:16-alpine in a test compose
npm run migrate
npm test
```

| Decision | Action |
|----------|--------|
| Compatible, upgrade | Update Docker compose, test, document upgrade steps |
| Issues found | Document workaround, defer |
| Not tested | DEFERRED with explanation |

```
Postgres 16 upgrade: [READY / DEFERRED / NOT TESTED]
Notes: [findings]
```

### Step 3 — Error Tracking (Sentry)

**Current state:** No error tracking in frontend PWA.

**Evaluate effort:**
```bash
# Check if Sentry SDK is installed
grep -r "@sentry\|sentry" frontend/package.json
```

| Decision | Action |
|----------|--------|
| Implement | `npm install @sentry/browser`, configure, add DSN to env |
| Not now | Document as future enhancement |

```
Sentry integration: [IMPLEMENTED / DEFERRED / REJECTED]
Reason: [explanation]
```

### Step 4 — Database Connection Pool

**Current state:** Uses `pg` defaults (max 20 connections).

**Check `backend/src/config/database.js`:**

```bash
grep -n "max\|pool\|min" backend/src/config/database.js
```

**Recommendation:** Expose `DATABASE_POOL_MAX` env var if not already.

```
Connection pool: [CONFIGURED / ALREADY SUFFICIENT / NEEDS WORK]
Notes: [findings]
```

---

## Verification

Each sub-item has its own verification (documented above).

---

## Completion Record

**Status:** ✅ COMPLETE  
**Completed:** 2026-10-14  
**By:** opencode agent

### Decisions

| Item | Decision | Notes |
|------|----------|-------|
| Redis for rate limiting | **DEFERRED (won't fix now)** | Railway runs a single replica (`numReplicas: 1`); the in-memory `express-rate-limit` store is adequate. Revisit only if horizontal scaling is introduced (then add `ioredis` + a shared store). |
| PostgreSQL 16 | **READY — dev/CI upgraded** | Validated against PostgreSQL **16.15** (`postgres:16-alpine`): 117/117 backend tests pass. `docker-compose.yml` and `.github/workflows/ci.yml` bumped to `postgres:16-alpine`. The production Railway DB upgrade is a dashboard operation — take a backup first. |
| Sentry error tracking | **DEFERRED** | No SDK installed; documented as a future enhancement. |
| Connection pool | **CONFIGURED** | Added `DATABASE_POOL_MAX` (default 20) via `env.js` → `database.js`; documented in `.env.example`. |

### Changes Made

| File | Action |
|------|--------|
| `backend/src/config/env.js` | Added `databasePoolMax` (`DATABASE_POOL_MAX`, default 20, invalid → 20) |
| `backend/src/config/database.js` | Pool `max` reads `env.databasePoolMax`; fixed stale Supabase SSL comment |
| `backend/.env.example` | Added `DATABASE_POOL_MAX`; domain refs → `validevento.com.br` |
| `docker-compose.yml` | `postgres:15-alpine` → `postgres:16-alpine` |
| `.github/workflows/ci.yml` | `postgres:15-alpine` → `postgres:16-alpine` |
| `Docs/HANDOFF-FINAL.md` | Created (final implementation summary) |

### Verification

```
# PostgreSQL 16.15 (docker postgres:16-alpine)
$ DATABASE_URL=postgresql://postgres:postgres@localhost:5433/validevento_test npm test
 Test Suites: 16 passed, 16 total
      Tests: 117 passed, 117 total

# Pool env var resolution
$ DATABASE_POOL_MAX unset    -> 20
$ DATABASE_POOL_MAX=5        -> 5
$ DATABASE_POOL_MAX=abc      -> 20
```

---

➡️ **All milestones complete — see `Docs/HANDOFF-FINAL.md`**
