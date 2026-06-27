# Plan 003: Fix snapshot merge to prevent overwriting locally-validated tickets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- frontend/src/services/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

When a terminal validates a ticket offline, it updates the local IndexedDB status to `validated` and adds a pending `entry_log`. When the next sync occurs, the server snapshot is downloaded and merged into the local DB. The current merge logic (`syncService.js`) only checks `local.status !== 'validated'` — but it uses `db.tickets.put()` which completely replaces the local ticket object with the server's data.

If the server snapshot hasn't yet received the offline validation (pending logs haven't been processed yet), the snapshot still shows the ticket as `active`, and `put()` overwrites the local `validated` status back to `active`.

The existing check `if (!local || local.status !== 'validated')` should protect against this, BUT `db.tickets.put()` is called with the snapshot data which spreads ALL server fields. If the snapshot's `status` is `active` and the local is `validated`, the condition correctly skips. However, there's a risk when `updated_at` or other fields get merged incorrectly.

## Current state

**`frontend/src/services/syncService.js`** (lines ~30-43):
```js
  // ── 3. Mesclar tickets na base local ──────────────────────────
  for (const ticket of snapshot.tickets) {
    const local = await db.tickets
      .where('ticket_code').equals(ticket.ticket_code).first()

    // RN-04 client-side: não sobrescreve status validated local
    if (!local || local.status !== 'validated') {
      await db.tickets.put({ ...ticket })
    }
  }
```

The problem: `{ ...ticket }` includes ALL fields from the server snapshot including `status`, `updated_at`, `validated_at` etc. The condition check correctly skips validated tickets, BUT if a ticket was validated locally AND the pending log hasn't been sent yet (before sync step 1), the snapshot's `status` field could overwrite the local validated status in a race condition.

More critically: the snapshot ONLY uses `ticket_code` to match. If a ticket was imported AFTER the last sync, the local DB has no record and the snapshot adds it with whatever status the server has. This is correct behavior for NEW tickets.

The real bug: The snapshot sends `since` parameter but the `since` timestamp is checked on `updated_at`. When a ticket is validated offline, its local `updated_at` is set to `now()`. If the snapshot was taken BEFORE the validation, the `since` filter won't include it. After the pending logs are sent (step 1), the server updates `updated_at`. On the NEXT sync cycle (60 min later), the snapshot will include the updated ticket. By then, the local status might have been reverted.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Start frontend dev | `npm run dev` in `frontend/` | Vite starts |

## Scope

**In scope**:
- `frontend/src/services/syncService.js`

**Out of scope**:
- Backend code
- Database schema changes

## Git workflow

- Branch: `advisor/003-fix-snapshot-merge`
- Commit message style: `fix: prevent snapshot overwriting locally-validated tickets using timestamp comparison`

## Steps

### Step 1: Modify the merge logic to use timestamp-based conflict resolution

In `frontend/src/services/syncService.js`, replace the current merge loop (step 3) with:

```js
  // ── 3. Mesclar tickets na base local com resolução de conflito ─
  for (const ticket of snapshot.tickets) {
    const local = await db.tickets
      .where('ticket_code').equals(ticket.ticket_code).first()

    if (!local) {
      // Ticket novo — adicionar
      await db.tickets.put({ ...ticket })
      continue
    }

    // RN-04 client-side: nunca sobrescreve status validated local
    if (local.status === 'validated') {
      continue
    }

    // Se o ticket local foi modificado após o snapshot do servidor,
    // preserva a versão local (provavelmente validação offline)
    const localUpdated = local.updated_at ? new Date(local.updated_at).getTime() : 0
    const serverUpdated = ticket.updated_at ? new Date(ticket.updated_at).getTime() : 0

    if (localUpdated > serverUpdated) {
      // Versão local é mais recente — preservar
      continue
    }

    // Servidor tem versão mais recente — atualizar
    await db.tickets.put({
      id: local.id, // preserva a chave primária local
      ...ticket,    // campos do servidor (inclui ticket_code, status, etc)
    })
  }
```

Key changes:
1. Uses `local.id` (Dexie primary key) to ensure the put targets the right record
2. Timestamp comparison to detect conflict — if the local ticket was updated AFTER the server snapshot, it's probably a local offline validation
3. Continues to respect the "never overwrite validated" rule as the primary guard

**Verify**: Read the modified file and confirm:
- `local.id` is used in `put()` call
- Timestamp comparison exists
- Validated tickets are skipped

### Step 2: Ensure pending logs are sent BEFORE the snapshot is applied

This is already the case in `syncService.js` — step 1 sends logs, step 2 downloads snapshot. However, the snapshot still uses `since` which may exclude tickets validated via the just-sent logs (because they happened before the snapshot request). This is acceptable because:
- The logs were processed by the server and updated the ticket status
- The NEXT sync will pick up the changes via `since` timestamp
- The local ticket status was already set to `validated` during offline validation

Add a comment to clarify this design:
```js
  // Os logs offline já foram processados pelo servidor (passo 1),
  // mas o snapshot (passo 2) pode ainda não refletir essas mudanças
  // pois o param `since` filtra por updated_at anterior ao sync.
  // Isto é intencional — a regra RN-04 preserva o status validated local
  // e o próximo sync capturará as atualizações do servidor.
```

**Verify**: Read the file and confirm the comment exists after step 3.

## Test plan

Manual verification:
1. Start backend + frontend
2. Go offline (DevTools > Network > Offline)
3. Validate a ticket offline — should show "authorized"
4. Check IndexedDB: ticket status should be "validated"
5. Go online — sync should happen
6. Check IndexedDB again: ticket status should remain "validated"
7. Dashboard should show the validated count incremented

## Done criteria

ALL must hold:
- [ ] `syncService.js` merge loop preserves `local.id` in `put()`
- [ ] Timestamp comparison prevents local->server regression
- [ ] Existing "validated" tickets are never overwritten
- [ ] Comment explaining the design is present
- [ ] `git status` shows no files outside in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts
- The `db.tickets.put()` API has changed between Dexie versions (verify against `frontend/node_modules/dexie` if unsure)
- A step's verification fails twice after a reasonable fix attempt

## Maintenance notes

- The timestamp-based conflict resolution relies on clock synchronization between server and client. Large clock skew (>1 hour) could cause issues.
- If the system needs to handle multi-terminal offline scenarios, consider adding a `sync_version` or vector clock to tickets.
