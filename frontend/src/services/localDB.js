import Dexie from 'dexie'

export const db = new Dexie('portaria_db')

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

export async function clearAll() {
  await db.tickets.clear()
  await db.entry_logs.clear()
  await db.meta.clear()
}

export async function getDBStats() {
  const tickets = await db.tickets.count()
  const pending = await db.entry_logs.where('synced').equals(0).count()
  const total_logs = await db.entry_logs.count()
  return { tickets, pending_logs: pending, total_logs }
}
