# Milestone 1 — Documentation Consolidation

**Status:** ✅ COMPLETE  
**Priority:** P2  
**Risk:** LOW  
**Effort:** S  
**Sessions:** 1-2  

---

## Goals

Consolidate conflicting/outdated SPEC files into a single accurate reference for future developers.

---

## Changes

### Step 1 — Archive legacy SPEC

**Action:** Rename `SPEC-sistema-validacao-portaria.md` to `SPEC-LEGACY-v1.md`

```bash
mv SPEC-sistema-validacao-portaria.md SPEC-LEGACY-v1.md
```

### Step 2 — Update `SPEC-validevento-v2.md`

**File:** `Docs/SPEC-validevento-v2.md`

Changes needed:

| Section | Current | Correct |
|---------|---------|---------|
| 0 (Header) | "Railway Hobby + Vercel Free + Supabase Free + Resend Free" | "Railway (backend + frontend + Postgres) + Cloudflare + Resend" |
| 0 (Header) | "Setembro 2026" | Keep or update date |
| Throughout | References to Vercel/Supabase | Remove or replace with Railway |
| Throughout | "Vercel" in deploy section | Remove |

**Also update:**
- Domain references: `seudominio.com` → `validevento.com.br`
- Backend URL: `https://seu-backend.railway.app` → `https://api.validevento.com.br`
- Frontend URL: `https://seu-frontend.vercel.app` → `https://www.validevento.com.br`

### Step 3 — Verify `Agent.md`

**File:** `Agent.md`

Review line 42:
```diff
- **Estilo** | **CSS custom + tokens `--vv-*` (SEM Tailwind no frontend novo)**
+ **Estilo** | **CSS custom + tokens `--vv-*` + Tailwind CSS**
```

Review Section "Infra (produção real)" — confirm accuracy:
- Railway backend: `api.validevento.com.br` ✅
- Railway frontend: `www.validevento.com.br` ✅
- Railway Postgres ✅
- Cloudflare DNS + CDN ✅
- Resend with `validevento.com.br` ✅

---

## Verification

After changes, run:

```bash
# Should return 0 results (no Vercel/Supabase in active docs)
grep -r "Supabase" Docs/ SPEC-*.md --include="*.md" | grep -v LEGACY
grep -r "Vercel" Docs/ SPEC-*.md --include="*.md" | grep -v LEGACY

# Should find correct infra references
grep -r "Railway" Docs/SPEC-validevento-v2.md
grep -r "validevento.com.br" Docs/SPEC-validevento-v2.md

# Verify Agent.md Tailwind note corrected
grep -i "tailwind\|SEM Tailwind" Agent.md
```

Expected results:
- 0 Supabase references in active docs
- 0 Vercel references in active docs
- Multiple Railway references in SPEC-validevento-v2.md
- Multiple validevento.com.br references
- "Tailwind" found, "SEM Tailwind" NOT found

---

## Testing

| Check | Method |
|-------|--------|
| No Vercel/Supabase refs in active docs | `grep` commands above |
| Agent.md Tailwind corrected | Manual review |
| SPEC-validevento-v2.md infra section accurate | Manual review |

---

## Completion Record

**Status:** ✅ COMPLETE  
**Completed:** 2026-10-14  
**By:** opencode agent

### Changes Made

- [x] `SPEC-LEGACY-v1.md` — archived old v1 spec (renamed from root `SPEC-sistema-validacao-portaria.md`)
- [x] `Docs/SPEC-validevento-v2.md` — Vercel/Supabase → Railway; header infra; date; domain `validevento.com.br`; backend `api.validevento.com.br`; frontend `www.validevento.com.br`; deploy step
- [x] `Agent.md` — corrected Tailwind note (both occurrences)
- [x] `Docs/PRD-validevento-v2.md` — infra table/header updated to Railway + Cloudflare
- [x] `Docs/PROMPT-patch-correcoes-estruturado.md` — Supabase/CORS references updated

### Verification Results

```
$ grep -r "Supabase" Docs/SPEC-validevento-v2.md      # 0 results
$ grep -r "Vercel"   Docs/SPEC-validevento-v2.md      # 0 results
$ grep -c "Railway"  Docs/SPEC-validevento-v2.md      # 5
$ grep -c "validevento.com.br" Docs/SPEC-validevento-v2.md   # 6
$ grep -i "tailwind" Agent.md                         # "Tailwind" found; "SEM Tailwind" NOT found
```

Residual Vercel/Supabase mentions remain only in historical documents
(`HANDOFF-MILESTONE0.md`, `HANDOFF-HOTFIX-SEGURANCA.md`, `HANDOFF-FASE4-PENDENCIAS.md`,
`HANDOFF-MILESTONE1.md`, `README-MILESTONES.md`) where they record past state and
findings — intentionally preserved.

### Notes

- The plan said to copy the completion record into `Docs/HANDOFF-MILESTONE2.md`, but
  that file already contains Milestone 2's plan. Recorded in place instead to avoid
  destroying Milestone 2; `README-MILESTONES.md` status updated to COMPLETE.
- Scope decision: active docs (SPEC, PRD, PROMPT) were purged of Vercel/Supabase;
  historical handoffs kept for provenance.

---

➡️ **Milestone 2: Security & Dependency Patches**
