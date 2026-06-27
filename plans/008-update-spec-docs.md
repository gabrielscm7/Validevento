# Plan 008: Update SPEC documentation to reflect UUID-only architecture

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cbee6d1..HEAD -- *.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `cbee6d1`, 2026-06-27

## Why this matters

The `SPEC-sistema-validacao-portaria.md` file is the main technical specification but still references CPF-based architecture (hash_cpf, salt, CPF search, etc.). This is actively misleading for developers joining the project. The `Agent.md` has been updated to reflect the UUID-only architecture, but the SPEC file serves as the canonical reference and must match.

## Current state

**`SPEC-sistema-validacao-portaria.md`** — still contains CPF references:
- Section 2.1: Entity diagram shows `hash_cpf` in `tickets` and `entry_logs` tables (lines 65-67)
- Section 2.2: Table definitions include `hash_cpf VARCHAR(64)` and `salt VARCHAR(64)` (lines 95, 108, 131)
- Section 6.1: CPF hashing algorithm described (lines 522-535)
- Section 6.2: CPF data flow diagram (lines 539-549)
- Section 8: CSV format includes `hash_cpf` column (lines 619-624)
- Section 4.3: Validation endpoint shows `cpf_raw` in request body (lines 322-324)
- Section 4.3: Search endpoint shows `?cpf=11122233344` parameter (line 361)

**`Agent.md`** is already updated with UUID-only architecture — no changes needed.

## Commands you will need

N/A — documentation only.

## Scope

**In scope**:
- `SPEC-sistema-validacao-portaria.md` — update all CPF references to UUID v4

**Out of scope**:
- `Agent.md` — already correct
- Any source code
- `prd-sistema-validacao-portaria.md` — keep as is (PRD is product requirements, not affected by implementation changes)

## Git workflow

- Branch: `advisor/008-update-spec-docs`
- Commit message style: `docs: update SPEC to reflect UUID v4 architecture (remove CPF references)`

## Steps

### Step 1: Update entity diagram (Section 2.1)

Replace lines 63-65:
```
│ batch            │       │ hash_cpf         │       │ entry_type     │
```
With:
```
│ batch            │       │ display_name     │       │ entry_type     │
```

Remove the `hash_cpf` field from both `tickets` and `entry_logs` entities in the diagram.

### Step 2: Update table definitions (Section 2.2)

In the `events` table, remove the `salt` column:
```sql
CREATE TABLE events (
  ...
  location      VARCHAR(255),
  capacity      INTEGER NOT NULL DEFAULT 1000,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

In the `tickets` table:
- Change `ticket_code VARCHAR(50)` to `ticket_code VARCHAR(36)` (UUID v4 is 36 chars)
- Remove `hash_cpf` column
- Change status constraint: remove `generated`, `linked` — keep only `active`, `validated`, `blocked`

In `entry_logs`:
- Remove `hash_cpf` column
- Remove `idx_logs_hash_cpf` index

### Step 3: Update Sections 4-8

- **Section 4.3 Validation**: Change request body from `cpf_raw` to `ticket_code` (UUID v4)
- **Section 4.4 Sync**: Remove `hash_cpf` from the logs request body
- **Section 5.1 IndexedDB**: Remove `hash_cpf` from Dexie schema
- **Section 5.2**: Remove CPF hashing diagram, replace with UUID v4 lookup
- **Section 5.3**: No changes needed (sync logic is already correct)
- **Section 6**: Remove entire sections 6.1 (hash CPF) and 6.2 (data flow). They are replaced by the UUID v4 validation flow
- **Section 7**: No changes needed
- **Section 8 CSV format**: Change columns from `ticket_code,batch,hash_cpf,display_name,status` to `ticket_code,batch,display_name,status`. Update description accordingly.
- **Section 9**: No changes needed (env vars)
- **Section 10**: Update test plan — remove T-07 (CPF search), update T-11 (remove `generated` status reference)

### Step 4: Update API examples

In Section 4.2 Import CSV response, remove references to `hash_cpf` errors:
Replace:
```json
{ "line": 23, "reason": "hash_cpf inválido" }
```
With:
```json
{ "line": 23, "reason": "ticket_code inválido" }
```

### Step 5: Remove Section 6 (Security and LGPD) CPF-specific content

Replace the entire Section 6 with a brief note:
```markdown
## 6. Segurança

### 6.1 Dados sensíveis

O sistema não armazena CPF em nenhuma forma. Os ingressos são identificados
unicamente por UUID v4 (ticket_code), que não contém informação pessoal.

### 6.2 Autenticação e autorização

(mantém o conteúdo atual das seções 6.3+)
```

## Test plan

After editing:
1. Read `SPEC-sistema-validacao-portaria.md` end-to-end
2. Search for `cpf`, `CPF`, `hash_cpf`, `salt`, `generated`, `linked` — verify zero results
3. Search for `uuid`, `UUID`, `ticket_code` — verify they appear in all correct contexts

## Done criteria

ALL must hold:
- [ ] No remaining references to `cpf`, `CPF`, `hash_cpf`, or `salt` in the SPEC
- [ ] No remaining references to `generated` or `linked` status in the SPEC
- [ ] Ticket code type updated to `VARCHAR(36)` for UUID v4
- [ ] Validation endpoint examples use `ticket_code` instead of `cpf_raw`
- [ ] Search endpoint examples use `?q=` instead of `?cpf=`
- [ ] CSV format example updated without `hash_cpf` column
- [ ] Dexie schema in Section 5.1 updated without `hash_cpf`
- [ ] Security section updated to remove CPF hashing
- [ ] `git status` shows no files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The code at the locations in "Current state" doesn't match the excerpts (the file has already been partially updated)
- A search for "cpf" (case-insensitive) in the file returns zero results AND the file still looks like the original — this means the file has already been updated, and no changes are needed

## Maintenance notes

- Keep the SPEC in sync with the code. Whenever the schema or API changes, update the SPEC in the same commit.
- The PRD (`prd-sistema-validacao-portaria.md`) intentionally describes the product goals, not the implementation. It doesn't need updating when the architecture changes.
