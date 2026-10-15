# Milestone 2 — Security & Dependency Patches

**Status:** ✅ COMPLETE  
**Priority:** P1  
**Risk:** MED  
**Effort:** S  
**Sessions:** 1-2  

---

## Goals

Patch known vulnerabilities before next production event.

---

## Changes

### Step 1 — Update jsonwebtoken (ReDoS CVE)

**Severity:** CRITICAL  
**File:** `backend/package.json`

```bash
cd backend
npm install jsonwebtoken@latest
```

**Verify:**
```bash
npm list jsonwebtoken  # should show latest version
npm test              # all suites pass
```

### Step 2 — Review Resend API Compatibility

```bash
cd backend
npm outdated resend
```

Check current usage in `backend/src/utils/email.js`:

```bash
grep -n "resend\|await.*emails\|resend.emails" backend/src/utils/email.js
```

**If Resend v4 is available and API-compatible:**
```bash
npm install resend@latest
```

**If breaking changes exist:** Log the breaking changes, defer Resend v4 upgrade to Milestone 5, note here:

```
Resend v4 upgrade: DEFERRED
Reason: [reason]
Tracking: [issue link or none]
```

### Step 3 — Run npm audit

```bash
cd backend
npm audit

cd ../frontend
npm audit
```

**For each HIGH/CRITICAL finding:**

| Vulnerability | Fix Command | Risk |
|---------------|-------------|------|
| [from audit] | [fix] | [LOW/MED/HIGH] |

**If a fix is risky or breaking:** Document and defer:

```
Audit item: [package] [CVE]
Severity: HIGH/CRITICAL
Decision: DEFERRED
Reason: [breaking change / test coverage needed / etc]
Tracking: [issue]
```

---

## Verification

```bash
cd backend && npm test
cd ../frontend && npm run lint && npm run build
```

All must pass.

---

## Manual Testing

After updates, verify critical flows:

| Test | Steps | Expected |
|------|-------|----------|
| Password reset email | `POST /api/auth/forgot-password` with valid email | Email delivered via Resend |
| Login | `POST /api/auth/login` with valid credentials | JWT returned |
| JWT verification | Call any protected endpoint with token | 200 response |

---

## Completion Record

**Status:** ✅ COMPLETE  
**Completed:** 2026-10-14  
**By:** opencode agent

### Changes Made

| Package | From | To | Notes |
|---------|------|----|-------|
| jsonwebtoken | 9.0.2 (lock 9.0.3) | 9.0.3 | Already latest; range bumped to `^9.0.3`. No open ReDoS advisory against 9.0.2/9.0.3 in current audit. |
| resend | 6.26.0 | 6.33.0 | Same major (6.x), API-compatible; `resend.emails.send()` usage unchanged. No "v4" line exists. |
| express | 4.22.2 | 4.22.3 | Transitive; pulled in patched proxy-addr + qs |
| proxy-addr | 2.0.7 | 2.0.8 | **CRITICAL** IP spoofing GHSA-jqcg-44mw-7w3h (backend + frontend) |
| qs | 6.15.2 | 6.16.1 | Moderate advisories GHSA-x5fp-wj9c-mxmx / GHSA-4mjr-xmp4-gh2g |
| react-router / react-router-dom | 7.17.x | 7.18.4 | HIGH open-redirect/XSS/DoS advisories (frontend) |
| source-map-js | 1.2.1 | 1.2.2 | HIGH DoS GHSA-68fv-2mgg-jv7q (frontend) |
| undici | 7.29.0 | 7.30.0 / 8.10.2 | HIGH advisories (frontend, transitive) |

All via `npm audit fix` (semver-compatible). No `--force` used, no production package.json major bumps.

### Audit Results

```
# Backend — production (npm audit --omit=dev)
Before: 6 vulnerabilities (4 moderate, 1 high, 1 critical)
After:  2 vulnerabilities (1 moderate, 1 high)   # csv-parse + xlsx, both deferred

# Frontend — all deps
Before: 29 vulnerabilities (7 moderate, 21 high, 1 critical)
After:  11 vulnerabilities (2 moderate, 9 high)  # shadcn + postcss-selector-parser, deferred
```

### Verification

```
backend:  npm test    -> 16 suites / 117 tests passed
frontend: npm run lint -> 0 problems
          npm run build -> built OK (PWA generated)
```

Manual smoke tests (login/JWT/email) were **not** run in this environment (requires a live
DB + `RESEND_API_KEY`); recommend running them on the next staging deploy.

### Known Risks / Deferred Items

| Item | Severity | Reason | Tracking |
|------|----------|--------|----------|
| csv-parse (`GHSA-8cw4-87c7-c6xx`) | moderate | Fix requires `csv-parse@7.0.3` (breaking change) | — |
| xlsx (`GHSA-4r6h-8v6p-xvw6`, `GHSA-5pgg-2g8v-p4x9`) | high | **No fix available**; consider maintained fork (`xlsx` SheetJS is unmaintained on npm) | — |
| shadcn → braces/micromatch/fast-glob/ts-morph (7 high) | high | Fix requires `shadcn@1.0.0` (breaking). Note: `shadcn` is a CLI but is in `dependencies`; consider moving to devDependencies | — |
| postcss-selector-parser (via tailwindcss) | moderate | Fix requires `tailwindcss@4` (breaking) | — |

### Notes

- The Milestone 0 assumption that `jsonwebtoken@9.0.2` carries a ReDoS CVE was **not**
  confirmed by the current advisory DB; 9.0.2 is already effectively patched and 9.0.3 is
  the latest. Bumped the range anyway for cleanliness.
- The "Resend v4" premise is inaccurate — the Resend SDK's current line is 6.x; updated
  6.26.0 → 6.33.0 within the same major (no breaking changes).
- The real critical hit was `proxy-addr` (transitive via Express), now fixed.
- Recorded in place rather than overwriting `Docs/HANDOFF-MILESTONE3.md` (which already
  contains Milestone 3's plan).

---

➡️ **Milestone 3: Deployment & Build Fixes**
