# Milestone 4 — Code Quality & Test Coverage

**Status:** ✅ COMPLETE  
**Priority:** P2  
**Risk:** LOW  
**Effort:** M (2-3 sessions)  
**Sessions:** 2-3  

> **Note:** This handoff document had been accidentally overwritten with a copy of
> Milestone 3. It was reconstructed from `README-MILESTONES.md` (Milestone 4
> description and findings #10–#12) and `HANDOFF-MILESTONE0.md`.

---

## Goals

Close test-coverage gaps on the offline-first terminal and add automated coverage
for critical user paths.

---

## Changes

### Step 1 — Frontend unit tests for offline/sync flows

**Files:** `frontend/src/__tests__/`

Add Vitest coverage for the terminal's offline-first behavior:

- `useValidation` state machine: `authorized`, `duplicate`, `blocked`,
  `not_found`; reentry modes `none` / `free` / `conditioned`; checkout.
- `syncWithServer`: pending-log upload + marking synced, server-reported errors
  kept pending, snapshot merge rules (local `validated` protected, newer local
  not overwritten, new tickets inserted), `event_config` / `last_sync_at`
  persistence, null when no event configured.

### Step 2 — Playwright e2e tests for critical paths

**Decision needed:** install `@playwright/test`, add config + specs
(login → create event → import → validate → report).

### Step 3 (optional) — Load testing setup

**Decision needed:** k6 / artillery script for the validation endpoint.

---

## Verification

```bash
cd frontend && npm test      # Vitest
cd frontend && npm run lint
```

---

## Completion Record

**Status:** ✅ COMPLETE  
**Completed:** 2026-10-14  
**By:** opencode agent

### Changes Made

| File | Action | Reason |
|------|--------|--------|
| `frontend/src/__tests__/sync.test.jsx` | ADDED | 17 tests: `useValidation` offline state machine + `syncWithServer` queue/merge rules |
| `Docs/HANDOFF-MILESTONE4.md` | REWRITTEN | Restored real Milestone 4 content (was a duplicate of Milestone 3) |

### Verification Results

```
$ cd frontend && npm test
 Test Files  7 passed (7)
      Tests  41 passed (41)      # was 24 before (+17)

$ cd frontend && npm run lint
 0 problems
```

### Decisions

```
Frontend e2e (Playwright): DEFERRED
  Reason: adds a dependency + browser binaries and needs a runnable stack
          (app + API + Postgres). Out of scope for this pass; tracked for a
          future session.
Load testing (k6/artillery): DEFERRED
  Reason: optional per the plan; no load environment available.
```

### Notes

- The offline/sync tests exercise the **real** Dexie/IndexedDB layer (via
  `fake-indexeddb`) and only mock the Axios `api` module, so merge/queue rules
  are verified against the actual data access code.
- Coverage now includes the reentry state machine end-to-end locally, which
  previously only had backend coverage (`backend/src/__tests__/reentry.test.js`).
- Critical paths are still not covered by automated e2e; recommend Playwright in
  a follow-up before the next large UI change.

---

➡️ **Milestone 5: Performance & Scaling**
