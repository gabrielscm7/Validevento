# Plan 004: Prevent offline false negatives — queue validation when ticket not in IndexedDB

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- frontend/src/hooks/useValidation.js frontend/src/services/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

When the terminal is offline, `useValidation.js` queries the local IndexedDB for the ticket. If the ticket was imported AFTER the last sync, it won't be in the local DB. The current code returns `not_found` immediately, even though the ticket might exist on the server. This means a valid ticket imported between sync cycles will be rejected as "não encontrado" if the terminal is offline at the moment of validation.

## Current state

**`frontend/src/hooks/useValidation.js`** (lines ~25-32):
```js
export function useValidation() {
  const { eventId, terminalId } = useTerminalStore()
  const { user } = useAuthStore()

  const validateTicketCode = useCallback(async (ticketCode) => {
    const code = ticketCode.trim().toLowerCase()
    try {
      if (navigator.onLine) {
        const { data } = await api.post('/api/validation/qrcode', {
          ticket_code: code,
          event_id:    eventId,
          terminal_id: terminalId,
        })
        return data
      }

      const ticket = await db.tickets
        .where('ticket_code').equals(code)
        .and((t) => t.event_id === eventId)
        .first()

      if (!ticket) return { status: RESULT.NOT_FOUND }
      // ... rest of offline logic
```

When offline, if `db.tickets.where(...).first()` returns undefined, it immediately returns `not_found`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Start frontend dev | `npm run dev` in `frontend/` | Vite starts |

## Scope

**In scope**:
- `frontend/src/hooks/useValidation.js`

**Out of scope**:
- Backend code
- Sync logic
- Search panel code

## Git workflow

- Branch: `advisor/004-offline-false-negative`
- Commit message style: `fix: prevent offline false negative by queueing not_found for retry on reconnect`

## Steps

### Step 1: Queue not_found results for retry when online

Modify `frontend/src/hooks/useValidation.js` to:

1. Add a queue for tickets that weren't found locally while offline
2. When `not_found` occurs offline, STILL return `not_found` to the user (they can't enter), but queue the ticket_code for automatic retry when connectivity returns
3. If the retry succeeds, it means the ticket exists on the server (imported after last sync) — this is informational, not a validation change

Add after the imports:
```js
const PENDING_VERIFICATION_KEY = 've_pending_verification'

function loadPendingVerification() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_VERIFICATION_KEY) || '[]')
  } catch { return [] }
}

function savePendingVerification(queue) {
  localStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(queue))
}
```

In the `validateTicketCode` callback, after the offline `not_found` path:
```js
      if (!ticket) {
        // Queue for re-verification when online — the ticket may exist
        // on the server but not yet synced to this terminal
        const pending = loadPendingVerification()
        pending.push({ ticket_code: code, timestamp: new Date().toISOString(), event_id: eventId })
        savePendingVerification(pending.slice(-50)) // keep last 50
        return { status: RESULT.NOT_FOUND }
      }
```

### Step 2: Auto-retry pending verifications on reconnect

Also in `useValidation.js`, add a `processPendingVerifications` function and hook it to online events:

```js
const processPendingVerifications = useCallback(async () => {
  if (!navigator.onLine) return
  const pending = loadPendingVerification()
  if (pending.length === 0) return

  // Filter out expired entries (> 1 hour old)
  const now = Date.now()
  const fresh = pending.filter(p => now - new Date(p.timestamp).getTime() < 3600000)
  savePendingVerification([]) // clear the queue

  for (const item of fresh) {
    try {
      const { data } = await api.post('/api/validation/qrcode', {
        ticket_code: item.ticket_code,
        event_id:    eventId,
        terminal_id: terminalId,
      })
      if (data.status === 'authorized' || data.status === 'duplicate' || data.status === 'blocked') {
        // Ticket EXISTS on server — update local DB via sync
        console.log(`Ticket ${item.ticket_code} confirmado no servidor (estava ausente localmente).`)
      }
    } catch { /* silent */ }
  }
}, [eventId, terminalId])
```

Add a `useEffect` to trigger this when coming online:
```js
const pendingVerificationRef = useRef(false)

useEffect(() => {
  const handleOnline = () => {
    if (!pendingVerificationRef.current) {
      pendingVerificationRef.current = true
      processPendingVerifications().finally(() => {
        pendingVerificationRef.current = false
      })
    }
  }

  window.addEventListener('online', handleOnline)
  return () => window.removeEventListener('online', handleOnline)
}, [processPendingVerifications])
```

Include `useRef` and `useEffect` in the React import at the top of the file (they're already imported since `useValidation.js` already imports from React — verify the existing imports).

## Test plan

Manual verification:
1. Start backend + frontend
2. Import a batch of tickets
3. Sync to terminal (sync completes)
4. Import one more ticket to the server (without syncing to terminal)
5. Put terminal offline
6. Scan QR code for the newly imported ticket
7. Result should show "não encontrado" (expected — ticket not in local DB)
8. Go online
9. Open localStorage and verify `ve_pending_verification` is cleared
10. Check server logs — verification was attempted on the new ticket

## Done criteria

ALL must hold:
- [ ] `useValidation.js` queues offline `not_found` tickets to localStorage
- [ ] A `processPendingVerifications` function exists and retries on online event
- [ ] The queue is bounded (max 50 items) and auto-expires after 1 hour
- [ ] `git status` shows no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts
- A step's verification fails twice after a reasonable fix attempt

## Maintenance notes

- This is a best-effort recovery mechanism — the validator should still try manual search if the QR code fails
- The queue uses localStorage (not IndexedDB) to avoid interfering with the sync logic
- If the ticket is found on the server during retry, the local DB will be updated on the next sync cycle
