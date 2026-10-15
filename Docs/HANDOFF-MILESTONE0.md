# Milestone 0 — System Assessment

**Completed by:** opencode agent  
**Date:** 2026-10-14  
**Status:** ✅ COMPLETE

---

## Assessment Summary

### Technology Stack (Verified)

#### Backend
| Component | Version | Status |
|-----------|---------|--------|
| Node.js | 20+ | ✅ Current |
| Express | 4.19 | ✅ Current |
| PostgreSQL | 15 | ⚠️ 15 → 16 upgrade available |
| jsonwebtoken | 9.0.2 | 🔴 ReDoS CVE — update to 9.0.3+ |
| bcryptjs | 2.4.3 | ⚠️ Consider bcrypt-native |
| Resend | 6.26 | 🔴 v4 has breaking API changes |
| helmet | 8.0 | ✅ Current |
| express-rate-limit | 7.4 | ✅ Current |
| pg | 8.12 | ⚠️ Update for bug fixes |
| xlsx | 0.18.5 | ⚠️ Update for security |

#### Frontend
| Component | Version | Status |
|-----------|---------|--------|
| React | 19.2 | ✅ Current |
| Vite | 8 | ✅ Current |
| Tailwind CSS | 3.4 | ✅ In use (contrary to Agent.md) |
| Zustand | 5 | ✅ Current |
| Dexie | 4.4 | ✅ Current |
| DOMPurify | 3.4 | ✅ Added post-plan-009 |

### Infrastructure (Production)
- **Backend:** Railway — `api.validevento.com.br`
- **Frontend:** Railway — `www.validevento.com.br`
- **Database:** Railway Postgres
- **DNS/CDN:** Cloudflare (SSL Full)
- **Email:** Resend (domain `validevento.com.br` verified)

### Security Status (Plan 009 — DONE ✅)
All critical multi-tenant isolation issues resolved:
- ✅ Legacy `/api/admin` and `/api/batches` removed
- ✅ `eventAccessFromInput` applied to validation/sync
- ✅ Role escalation blocked on `PUT /api/users/:id`
- ✅ `/api/events/active` filtered by tenant
- ✅ XSS mitigated (backend escape + DOMPurify)
- ✅ Master ticket / gate closed aligned
- ✅ Email case-insensitive lookup
- ✅ Password minimum enforced in backend

---

## Findings to Address

| # | Category | Issue | Severity | Milestone |
|---|----------|-------|----------|-----------|
| 1 | Docs | `SPEC-sistema-validacao-portaria.md` references old CPF architecture | HIGH | 1 |
| 2 | Docs | `SPEC-validevento-v2.md` shows Vercel/Supabase (not used) | HIGH | 1 |
| 3 | Docs | `Agent.md` claims "SEM Tailwind" (wrong) | LOW | 1 |
| 4 | Security | `jsonwebtoken` 9.0.2 — ReDoS CVE | CRITICAL | 2 |
| 5 | Security | `resend` v6 — v4 has breaking changes, need review | MED | 2 |
| 6 | Security | `npm audit` — other HIGH/CRITICAL items | MED | 2 |
| 7 | Deploy | `.github/workflows/deploy.yml` missing `VITE_API_URL` | HIGH | 3 |
| 8 | Deploy | `frontend/nginx.conf` uses `${API_URL}` (never substituted) | MED | 3 |
| 9 | Deploy | `Dockerfile.frontend` exists but Railway uses Nixpacks | LOW | 3 |
| 10 | Quality | Frontend test coverage: 16 tests (minimal) | MED | 4 |
| 11 | Quality | No e2e tests for critical paths | MED | 4 |
| 12 | Quality | No load/stress testing | LOW | 4 |
| 13 | Scaling | In-memory rate limiting (no Redis) | LOW | 5 |
| 14 | Scaling | PostgreSQL 15 → 16 upgrade path | LOW | 5 |

---

## Next Steps

➡️ **Milestone 1: Documentation Consolidation**

See `Docs/HANDOFF-MILESTONE1.md`

---

## Commands Reference

| Purpose | Command |
|---------|---------|
| Backend tests | `cd backend && npm test` |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend build | `cd frontend && npm run build` |
| Frontend tests | `cd frontend && npm test` |
| Backend audit | `cd backend && npm audit` |
| Frontend audit | `cd frontend && npm audit` |
| Docker dev | `docker compose up -d` |
