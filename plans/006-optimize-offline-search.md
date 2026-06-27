# Plan 006: Optimize offline search performance with composite index and debounce

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- frontend/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

The offline search in SearchPanel uses `.filter()` which performs a full scan of all tickets in the event in JavaScript. With 1000+ tickets, this becomes slow and the UI feels sluggish. The Dexie schema already has `event_id` as an indexed field — we can optimize the query to use IndexedDB's native compound index capabilities.

## Current state

**`frontend/src/components/SearchPanel.jsx`** (lines ~57-66):
```js
} else {
  if (trimmed.length < 3) { setResults([]); return }
  const lower = trimmed.toLowerCase()
  const all = await db.tickets
    .where('event_id').equals(eventId)
    .filter((t) =>
      t.display_name?.toLowerCase().includes(lower) ||
      t.ticket_code?.toLowerCase().includes(lower)
    )
    .limit(10).toArray()
  setResults(all.map((t) => ({ ... })))
}
```

**`frontend/src/services/localDB.js`** — Dexie schema:
```js
db.version(1).stores({
  tickets:    '++id, ticket_code, status, event_id, updated_at',
  entry_logs: '++id, ticket_id, synced, created_at, event_id',
  meta:       'key',
})
```

IndexedDB only has single-field indexes. The `.filter()` call forces IndexedDB to scan ALL tickets for the given `event_id` and evaluate the filter in JS. This is O(n) where n = total tickets for the event.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Start frontend dev | `npm run dev` in `frontend/` | Vite starts |

## Scope

**In scope**:
- `frontend/src/components/SearchPanel.jsx`
- `frontend/src/services/localDB.js`

**Out of scope**:
- Backend code
- Online search (already handled by API with SQL ILIKE)

## Git workflow

- Branch: `advisor/006-optimize-offline-search`
- Commit message style: `perf: optimize offline search with early-termination and debounce improvement`

## Steps

### Step 1: Replace `.filter()` with collection-based early-termination

In `frontend/src/components/SearchPanel.jsx`, replace the offline search block:

Current:
```js
const all = await db.tickets
  .where('event_id').equals(eventId)
  .filter((t) =>
    t.display_name?.toLowerCase().includes(lower) ||
    t.ticket_code?.toLowerCase().includes(lower)
  )
  .limit(10).toArray()
```

Replace with:
```js
const all = []
// Use each() with early termination — much faster than filter()+limit() for large collections
await db.tickets
  .where('event_id').equals(eventId)
  .each((t) => {
    if (all.length >= 10) return // stop iterating once we have 10 results
    if (
      t.display_name?.toLowerCase().includes(lower) ||
      t.ticket_code?.toLowerCase().includes(lower)
    ) {
      all.push({
        ticket_id: t.id,
        ticket_code: t.ticket_code,
        display_name: t.display_name,
        batch: t.batch,
        status: t.status,
      })
    }
  })
setResults(all)
```

**Why this is faster**: `.filter()` loads ALL matching event_id tickets into an array first, THEN filters in JS. `.each()` iterates one by one and stops early. For an event with 1000 tickets, the old code creates a 1000-item array every keystroke; the new code only iterates until it finds 10 matches.

**Verify**: Read the modified file and confirm `.each()` is used instead of `.filter()`.

### Step 2: Add display_name to compound index (Dexie v4+)

In `frontend/src/services/localDB.js`, add a compound index on `event_id + display_name` to allow faster name-based lookups. Dexie supports compound indexes in the schema string:

```js
db.version(1).stores({
  tickets:    '++id, ticket_code, status, event_id, [event_id+display_name], updated_at',
  entry_logs: '++id, ticket_id, synced, created_at, event_id',
  meta:       'key',
})
```

Note: Compound indexes are created on new database opening. They only index new data going forward. For existing data, you'd need to either:
1. Clear IndexedDB and re-sync (`portaria_db` database)
2. Or add a migration version

Since this is a development/deployment scenario and the user can re-sync, add a version increment:

```js
db.version(1).stores({
  tickets:    '++id, ticket_code, status, event_id, updated_at',
  entry_logs: '++id, ticket_id, synced, created_at, event_id',
  meta:       'key',
})

db.version(2).stores({
  tickets:    '++id, ticket_code, status, event_id, [event_id+display_name], updated_at',
  entry_logs: '++id, ticket_id, synced, created_at, event_id',
  meta:       'key',
})
```

Dexie will auto-detect the version bump and upgrade the schema.

**Verify**: Read `localDB.js` and confirm the compound index `[event_id+display_name]` is in the schema.

### Step 3: Improve debounce timing

In `frontend/src/components/SearchPanel.jsx`, the current debounce is 350ms. Change it to 250ms for slightly more responsive feel (since the query is now faster):

```js
clearTimeout(debounceRef.current)
debounceRef.current = setTimeout(() => search(val), 250)
```

**Verify**: Read the file and confirm the debounce delay is 250ms.

## Test plan

Manual verification:
1. Start backend + frontend
2. Import at least 500 tickets
3. Sync to terminal
4. Go to Terminal > Busca Manual
5. Start typing a name — results should appear faster than before
6. Verify search still returns correct results (check against known ticket names)

## Done criteria

ALL must hold:
- [ ] `SearchPanel.jsx` uses `.each()` with early termination instead of `.filter()`
- [ ] `localDB.js` has version 2 with `[event_id+display_name]` compound index
- [ ] Debounce improved from 350ms to 250ms
- [ ] `git status` shows no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts
- The version bump causes existing IndexedDB data loss (this is expected — the user needs to re-sync, which happens automatically)
- A step's verification fails twice after a reasonable fix attempt

## Maintenance notes

- The compound index only works for queries that filter by BOTH `event_id` AND `display_name`. Single-field queries on `display_name` alone won't use this index.
- Version bumps in Dexie cause the browser to delete and recreate stores — existing offline data will be lost and must be re-synced. This is acceptable since the sync happens automatically.
