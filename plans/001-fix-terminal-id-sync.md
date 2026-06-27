# Plan 001: Fix terminalId persistence in IndexedDB — heartbeat, logs, and terminal tracking

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- frontend/src/services/ frontend/src/store/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

The terminal's `terminalId` is stored in Zustand (persisted to localStorage) but is never written to IndexedDB. The sync logic in `syncService.js` reads `terminalId` from IndexedDB via `getTerminalId()`, which always returns `null`. As a result:

1. Heartbeat is never sent (terminal never registered on server)
2. Offline logs are synced without `terminal_id`, losing source terminal identity
3. Dashboard shows terminals as never registered or always offline

This is the root cause of the "database update" problems — the server never knows which terminal is sending data.

## Current state

**`frontend\src\services\syncService.js`** — reads terminalId from IndexedDB (always null):
```js
export async function syncWithServer(forceFullSync = false) {
  const eventId    = await getEventId()
  const terminalId = await getTerminalId()
  if (!eventId) throw new Error('Nenhum evento configurado localmente.')

  // ── 1. Enviar logs offline pendentes ──────────────────────────
  ...
  // ── 5. Heartbeat para registrar o terminal como online ─────────
  if (terminalId) {
    api.post('/api/sync/heartbeat', {
      event_id:    eventId,
      terminal_id: terminalId,
    }).catch(() => { /* silencioso — offline */ })
  }
```

**`frontend\src\services\localDB.js`** — has `setTerminalId`/`getTerminalId` but never called:
```js
export async function setTerminalId(id) {
  await db.meta.put({ key: 'terminal_id', value: id })
}

export async function getTerminalId() {
  const rec = await db.meta.get('terminal_id')
  return rec?.value ?? null
}
```

**`frontend\src\store\terminalStore.js`** — stores terminalId in Zustand but doesn't sync to IndexedDB:
```js
setTerminal: ({ terminalId, terminalName }) =>
    set({ terminalId, terminalName }),
```

**`frontend\src\store\syncStore.js`** — `sync()` calls `syncWithServer()` which reads from IndexedDB.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Start dev | inside `frontend/`: `npm run dev` | Vite dev server starts |

## Scope

**In scope** (the only files you should modify):
- `frontend/src/store/terminalStore.js`
- `frontend/src/services/syncService.js`
- `frontend/src/services/localDB.js`

**Out of scope**:
- Backend code
- Any changes to Dexie schema
- Any changes to database tables

## Git workflow

- Branch: `advisor/001-fix-terminal-id-sync`
- Commit per logical unit
- Commit message style: `fix: persist terminalId to IndexedDB on registration`

## Steps

### Step 1: Generate terminalId on first use in `terminalStore.js`

Modify `frontend/src/store/terminalStore.js` to:
1. Auto-generate a UUID v4 as `terminalId` on first load if none exists
2. Write it to IndexedDB via `setTerminalId()` whenever it's set
3. Read from IndexedDB on initialization instead of only relying on Zustand

Change the store initialization:

```js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'
import { setEventId, setTerminalId, getTerminalId } from '../services/localDB'

export const useTerminalStore = create(
  persist(
    (set, get) => ({
      terminalId:   null,
      terminalName: null,
      eventId:      import.meta.env.VITE_EVENT_ID || null,
      loadingEvent: false,
      initialized:  false, // track whether we've restored from IndexedDB

      initTerminal: async () => {
        if (get().initialized) return
        // Try to restore terminalId from IndexedDB first
        const storedTerminalId = await getTerminalId()
        if (storedTerminalId) {
          set({ terminalId: storedTerminalId, initialized: true })
          return
        }
        // Generate one if none exists
        const newId = crypto.randomUUID()
        set({ terminalId: newId, initialized: true })
      },

      setTerminal: async ({ terminalId, terminalName }) => {
        set({ terminalId, terminalName })
        if (terminalId) await setTerminalId(terminalId)
      },

      setEvent: async ({ eventId }) => {
        set({ eventId })
        if (eventId) await setEventId(eventId)
      },

      clear: () =>
        set({ terminalId: null, terminalName: null }),

      isConfigured: () => !!get().terminalId && !!get().eventId,

      ensureEvent: async () => {
        if (get().eventId) return
        if (get().loadingEvent) return
        set({ loadingEvent: true })
        try {
          const { data } = await api.get('/api/events/active')
          await setEvent(data)
          set({ loadingEvent: false })
          console.log(`Evento detectado: ${data.name} (${data.id})`)
        } catch {
          set({ loadingEvent: false })
          console.warn('Nenhum evento ativo encontrado. Execute npm run seed.')
        }
      },
    }),
    {
      name: 've_terminal',
      partialize: (s) => ({
        terminalId:   s.terminalId,
        terminalName: s.terminalName,
        eventId:      s.eventId,
      }),
    }
  )
)
```

**Verify**: Read the file and confirm the `crypto.randomUUID()` generation line exists and `setTerminalId` is imported and called.

### Step 2: Ensure `initTerminal` is called on Terminal mount

In `frontend/src/pages/Terminal.jsx`, add `initTerminal` to the `useEffect` that already calls `ensureEvent()`:

Around line 23, change:
```js
const { terminalName, ensureEvent } = useTerminalStore()
```
to:
```js
const { terminalName, ensureEvent, initTerminal } = useTerminalStore()
```

And add `initTerminal()` to the existing useEffect:
```js
useEffect(() => {
  initTerminal()
  ensureEvent()
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

**Verify**: Read the file and confirm both calls exist in the same useEffect.

### Step 3: Capture heartbeat response to update terminalId

In `frontend/src/services/syncService.js`, modify the heartbeat section to capture the returned `terminal_id`:

Around line 49, change:
```js
  // ── 5. Heartbeat para registrar o terminal como online ─────────
  if (terminalId) {
    api.post('/api/sync/heartbeat', {
      event_id:    eventId,
      terminal_id: terminalId,
    }).catch(() => { /* silencioso — offline */ })
  }
```
to:
```js
  // ── 5. Heartbeat para registrar o terminal como online ─────────
  if (terminalId) {
    try {
      const { data } = await api.post('/api/sync/heartbeat', {
        event_id:    eventId,
        terminal_id: terminalId,
        name:        navigator.userAgent?.slice(0, 80) || 'Terminal Móvel',
      })
      // Capture server-confirmed terminal UUID
      if (data.terminal_id && data.terminal_id !== terminalId) {
        const { setTerminalId } = await import('./localDB')
        await setTerminalId(data.terminal_id)
      }
    } catch { /* silencioso — offline */ }
  }
```

**Verify**: Read the file and confirm the heartbeat now uses `await` and captures the response's `terminal_id`.

## Test plan

Manual verification:
1. Start backend + frontend locally
2. Login as validator
3. Open browser DevTools > Application > IndexedDB > portaria_db > meta
4. Verify `terminal_id` key exists
5. Check Network tab: POST /api/sync/heartbeat should include `terminal_id`
6. In Dashboard, verify terminal appears as "Online"

## Done criteria

ALL must hold:
- [ ] `terminalStore.js` imports and calls `setTerminalId` from `localDB`
- [ ] `Terminal.jsx` calls `initTerminal()` on mount
- [ ] `syncService.js` heartbeat captures `data.terminal_id` response
- [ ] `git status` shows no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts (codebase has drifted)
- `crypto.randomUUID()` is not available in the target browsers (it is available in all modern browsers)
- A step's verification fails twice after a reasonable fix attempt

## Maintenance notes

- If Dexie schema changes in the future, ensure `meta` store still has `key` as the primary key
- The `setTerminal` action in terminalStore now calls IndexedDB — keep this async pattern if the store changes
