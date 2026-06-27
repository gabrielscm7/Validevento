# Plan 002: Add UUID v4 validation on import and validation endpoints

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- backend/src/modules/import/ backend/src/modules/validation/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness, security
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

Currently, the import service accepts ANY string as `ticket_code` without validating UUID v4 format. The validation endpoint also doesn't validate UUID format before querying the database. This means:

1. Corrupted QR codes or malformed input cause unnecessary DB queries
2. Invalid data can be imported, polluting the database
3. UUID v4 is the expected format per the spec — validation ensures data integrity

## Current state

**`backend/src/modules/import/import.service.js`** (lines ~130-135):
```js
ticketCode = ticketCode.trim().toLowerCase();

let status = rawStatus;
const validStatuses = ['active', 'validated', 'blocked'];
if (!validStatuses.includes(status)) {
  status = 'active';
}
```

No UUID validation before inserting/updating.

**`backend/src/modules/validation/validation.service.js`** (line ~8):
```js
async function validateQRCode(eventId, terminalId, validatorId, ticketCode) {
  const normalizedCode = ticketCode.trim().toLowerCase();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const ticketRes = await client.query(
      `SELECT id, ticket_code, display_name, batch, status, validated_at
       FROM tickets
       WHERE event_id = $1 AND LOWER(ticket_code) = $2`,
      [eventId, normalizedCode]
    );
```

No UUID validation before querying.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Start backend | inside `backend/`: `npm start` | Server starts on port 3000 |

## Scope

**In scope**:
- `backend/src/modules/import/import.service.js`
- `backend/src/modules/validation/validation.service.js`

**Out of scope**:
- Frontend code
- Database schema changes
- Test files (no existing test infrastructure to extend)

## Git workflow

- Branch: `advisor/002-validate-uuid`
- Commit per logical unit
- Commit message style: `fix: add UUID v4 validation on import and validation endpoints`

## Steps

### Step 1: Create a UUID validation utility

There is no utils directory currently (the old `hash.js` was removed). Create `backend/src/utils/validation.js`:

```js
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUIDv4(value) {
  if (!value || typeof value !== 'string') return false;
  return UUID_V4_REGEX.test(value.trim());
}

module.exports = { isValidUUIDv4 };
```

The regex validates:
- 8 hex chars + hyphen + 4 hex chars + hyphen + `4` (version 4) + 3 hex chars + hyphen + one of `89ab` (variant) + 3 hex chars + hyphen + 12 hex chars
- Case insensitive

**Verify**: Read the created file and confirm the regex matches standard UUID v4 format.

### Step 2: Add validation to import service

In `backend/src/modules/import/import.service.js`:

Add `require` at top:
```js
const { isValidUUIDv4 } = require('../utils/validation');
```

Inside `importFile`, after line `ticketCode = ticketCode.trim().toLowerCase();`, add:
```js
if (!isValidUUIDv4(ticketCode)) {
  errors.push({ line: i + 2, reason: `ticket_code inválido: '${ticketCode}' não é um UUID v4 válido.` });
  continue;
}
```

Also add the same check in `normalizeRecord` or immediately after the `ticketCode` is assigned inside the loop at line ~131.

**Verify**: Read the file and confirm the validation is called before the DB insert/update.

### Step 3: Add validation to validation service

In `backend/src/modules/validation/validation.service.js`:

Add `require` at top:
```js
const { isValidUUIDv4 } = require('../utils/validation');
```

At the beginning of `validateQRCode`, after `const normalizedCode = ticketCode.trim().toLowerCase();`, add:
```js
if (!isValidUUIDv4(normalizedCode)) {
  return { status: 'not_found' };
}
```

This returns `not_found` (same response as if the ticket doesn't exist) to avoid leaking information about valid UUID formats.

**Verify**: Read the file and confirm the validation is called before the DB query.

## Test plan

Manual verification:
1. Start backend
2. Try importing a CSV with invalid ticket_codes (e.g. "ABC", "123", "not-a-uuid")
3. Verify the import response includes errors with UUID validation messages
4. Try POST /api/validation/qrcode with `ticket_code: "invalid"`
5. Verify response is `{ status: "not_found" }` without a DB query being executed

## Done criteria

ALL must hold:
- [ ] `backend/src/utils/validation.js` exists with UUID v4 regex
- [ ] `import.service.js` rejects invalid UUIDs during import
- [ ] `validation.service.js` returns `not_found` for invalid UUIDs
- [ ] `git status` shows no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts
- A step's verification fails twice after a reasonable fix attempt

## Maintenance notes

- The UUID v4 regex is strict about version nibble (`4`) and variant (`89ab`). If the system needs to accept other UUID versions in the future, the regex must be relaxed.
- Consider adding a server middleware for input validation in future iterations.
