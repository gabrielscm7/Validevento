# Plan 005: Configure Excel import mapping for Base teste.xlsx

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- backend/src/modules/import/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

The user's file "Base teste.xlsx" contains UUID v4 codes and names but does NOT have a `lote`/`batch` column. All rows in this file show "SESI São Carlos" as the name and have no batch information. The current import defaults to `LOTE-01` when batch is missing, which is correct, but the field aliases need to be verified to handle the actual column names in the file.

The Excel file structure (confirmed from actual data):
- Column A: `Codigo` → UUID v4 (e.g., `FF24A6BE-FD79-47A5-95B0-EC9A79F3A1EC`)
- Column B: `Nome` → Display name (e.g., `SESI São Carlos`)

## Current state

**`backend/src/modules/import/import.service.js`** — field aliases already handle the mapping:
```js
const FIELD_ALIASES = {
  codigo: 'ticket_code',
  nome: 'display_name',
  código: 'ticket_code',
  id_ingresso: 'ticket_code',
  id: 'ticket_code',
  code: 'ticket_code',
  lote: 'batch',
  batch_name: 'batch',
  nome_exibicao: 'display_name',
  name: 'display_name',
};
```

`codigo` → `ticket_code` and `nome` → `display_name` are already mapped. However, the file has NO batch column, so all tickets will default to `LOTE-01`. The file also has uppercase UUIDs which get lowercased during import — this is handled correctly by the existing code.

The main gap: there's no batch column, and the user may want to specify a batch during import (via UI) rather than having all tickets default to `LOTE-01`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Start backend | `npm start` in `backend/` | Server starts |
| Test import | `curl -F "file=@C:\Users\Mion\Downloads\Base teste.xlsx" -F "event_id=<uuid>" http://localhost:3000/api/import/csv -H "Authorization: Bearer <token>"` | Import completes |

## Scope

**In scope**:
- `backend/src/modules/import/import.service.js`
- `frontend/src/components/admin/ImportTab.jsx`
- `backend/src/modules/import/import.controller.js`

**Out of scope**:
- Validation endpoint changes
- Database migrations

## Git workflow

- Branch: `advisor/005-excel-import-batch`
- Commit message style: `feat: add optional batch override parameter to import endpoint`

## Steps

### Step 1: Add optional `batch` query parameter to import endpoint

In `backend/src/modules/import/import.controller.js`, capture an optional `batch` parameter from the request body:

Modify the controller:
```js
async function importFile(req, res) {
  try {
    const { event_id, batch: batchOverride } = req.body;
    // ... existing validation ...

    const result = await importService.importFile(event_id, req.file.path, req.file.originalname, batchOverride);
    // ... rest unchanged ...
```

### Step 2: Pass batchOverride to import service normalization

In `backend/src/modules/import/import.service.js`:

Modify the `importFile` function signature:
```js
async function importFile(eventId, filePath, originalName, batchOverride) {
```

In the import loop, modify the `normalizeRecord` call:
Replace:
```js
let { ticketCode, batch, displayName, status: rawStatus } = normalizeRecord(raw);
```
With:
```js
let { ticketCode, batch, displayName, status: rawStatus } = normalizeRecord(raw, batchOverride);
```

Modify the `normalizeRecord` function:
```js
function normalizeRecord(raw, batchOverride) {
  const r = normalizeKeys(raw);
  const ticketCode   = r.ticket_code || '';
  const batch        = batchOverride || r.batch || 'LOTE-01';
  const displayName  = r.display_name || null;
  const status       = (r.status || 'active').toLowerCase();
  return { ticketCode, batch, displayName, status };
}
```

### Step 3: Add batch override field to the frontend ImportTab

In `frontend/src/components/admin/ImportTab.jsx`, add a batch name input field that is sent with the form data:

Add state:
```js
const [batchOverride, setBatchOverride] = useState('')
```

Add an input field before the submit button:
```jsx
<div className="flex flex-wrap items-end gap-3">
  <div className="flex-1 min-w-[200px]">
    <label className="label text-xs mb-1">Lote padrão (opcional)</label>
    <input
      type="text"
      className="input"
      placeholder="Ex: LOTE-01 (usado se o arquivo não tiver coluna lote)"
      value={batchOverride}
      onChange={(e) => setBatchOverride(e.target.value)}
    />
  </div>
  <button type="submit" disabled={loading} className="btn-primary py-2.5 px-5 text-sm">
    {/* existing button content */}
  </button>
</div>
```

Add `batchOverride` to the FormData:
```js
formData.append('batch', batchOverride)
```

**Verify**: Read the modified files and confirm:
- `batchOverride` parameter flows from controller → service → normalizeRecord
- `ImportTab.jsx` has the batch input field
- FormData includes `batch` parameter

## Test plan

Manual verification:
1. Start backend + frontend
2. Open Admin Config > Importar CSV
3. Enter batch name "SESI SÃO CARLOS" in the optional batch field
4. Upload "Base teste.xlsx"
5. Verify import result shows all tickets in batch "SESI SÃO CARLOS"

Automated test (curl):
```bash
curl -X POST http://localhost:3000/api/import/csv \
  -H "Authorization: Bearer <token>" \
  -F "file=@C:\Users\Mion\Downloads\Base teste.xlsx" \
  -F "event_id=<event-uuid>" \
  -F "batch=SESI SÃO CARLOS"
```
Expected: `{ "inserted": N, "batch": "SESI SÃO CARLOS", ... }`

## Done criteria

ALL must hold:
- [ ] `import.service.js` accepts and applies `batchOverride` parameter
- [ ] `import.controller.js` passes `batch` body param to service
- [ ] `ImportTab.jsx` has a batch override input field that sends with the form
- [ ] Importing "Base teste.xlsx" with batch override correctly assigns all tickets to that batch
- [ ] Existing behavior preserved when batchOverride is empty (defaults to `LOTE-01` or file's batch column)
- [ ] `git status` shows no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts
- The actual Excel file at `C:\Users\Mion\Downloads\Base teste.xlsx` has a different structure (use `npx xlsx-cli` to inspect it first)
- A step's verification fails twice after a reasonable fix attempt

## Maintenance notes

- The batch override takes precedence over both the file's batch column and the default `LOTE-01`
- Future enhancements could allow batch mapping per row type (e.g., map "SESI São Carlos" to batch "SESI")
