import Dexie from 'dexie'

export const db = new Dexie('portaria_db')

db.version(1).stores({
  tickets:    '++id, ticket_code, hash_cpf, status, event_id, updated_at',
  entry_logs: '++id, ticket_id, hash_cpf, synced, created_at, event_id',
  meta:       'key',
})

// ── Helpers ──────────────────────────────────────

/** Salva ou actualiza timestamp de último sync */
export async function setLastSync(isoString) {
  await db.meta.put({ key: 'last_sync_at', value: isoString })
}

export async function getLastSync() {
  const rec = await db.meta.get('last_sync_at')
  return rec?.value ?? null
}

export async function setTerminalId(id) {
  await db.meta.put({ key: 'terminal_id', value: id })
}

export async function getTerminalId() {
  const rec = await db.meta.get('terminal_id')
  return rec?.value ?? null
}

export async function setEventId(id) {
  await db.meta.put({ key: 'event_id', value: id })
}

export async function getEventId() {
  const rec = await db.meta.get('event_id')
  return rec?.value ?? null
}

/** Apaga tudo e reinicia — usado quando troca de evento */
export async function clearAll() {
  await db.tickets.clear()
  await db.entry_logs.clear()
  await db.meta.clear()
}

/** Retorna diagnóstico do IndexedDB */
export async function getDBStats() {
  const tickets = await db.tickets.count()
  const pending = await db.entry_logs.where('synced').equals(0).count()
  const total_logs = await db.entry_logs.count()
  return { tickets, pending_logs: pending, total_logs }
}
