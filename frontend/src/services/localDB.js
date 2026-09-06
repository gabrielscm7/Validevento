import Dexie from 'dexie'

/**
 * Base local (IndexedDB) do terminal — schema v2.
 * Operação offline-first: ingressos do evento são baixados via snapshot,
 * validações feitas offline ficam enfileiradas em entry_logs (synced=0).
 */
export const db = new Dexie('validevento_db')

db.version(1).stores({
  tickets:    '++id, ticket_code, status, event_id',
  entry_logs: '++id, ticket_id, synced, created_at',
  meta:       'key',
})

db.version(2).stores({
  tickets:    '++id, ticket_code, status, event_id, origin, checkout_at',
  entry_logs: '++id, ticket_id, ticket_code, synced, created_at',
  meta:       'key',
})

// ────────────────────────────────────────────────
// Meta (chave/valor)
// Chaves usadas: last_sync_at, event_id, terminal_id,
// event_config, master_ticket, user
// ────────────────────────────────────────────────

export async function saveMeta(key, value) {
  await db.meta.put({ key, value })
  return value
}

export async function getMeta(key) {
  const rec = await db.meta.get(key)
  return rec?.value ?? null
}

// Helpers legados (mantidos para compatibilidade com stores/páginas)
export async function setLastSync(isoString) {
  return saveMeta('last_sync_at', isoString)
}

export async function getLastSync() {
  return getMeta('last_sync_at')
}

export async function setTerminalId(id) {
  return saveMeta('terminal_id', id)
}

export async function getTerminalId() {
  return getMeta('terminal_id')
}

export async function setEventId(id) {
  return saveMeta('event_id', id)
}

export async function getEventId() {
  return getMeta('event_id')
}

// ────────────────────────────────────────────────
// Tickets
// ────────────────────────────────────────────────

/** Busca ticket local pelo ticket_code (case-insensitive). */
export async function getTicketByCode(ticketCode) {
  if (!ticketCode) return null
  return db.tickets
    .where('ticket_code')
    .equalsIgnoreCase(String(ticketCode).trim())
    .first()
}

/**
 * Atualiza status (e opcionalmente checkout_at) de um ticket local.
 * Retorna o ticket atualizado ou null se não existir.
 */
export async function updateTicketStatus(ticketCode, status, checkoutAt) {
  const ticket = await getTicketByCode(ticketCode)
  if (!ticket) return null

  const patch = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (checkoutAt !== undefined) {
    patch.checkout_at = checkoutAt || null
  }
  await db.tickets.update(ticket.id, patch)
  return { ...ticket, ...patch }
}

// ────────────────────────────────────────────────
// Entry logs (fila offline)
// ────────────────────────────────────────────────

/** Insere um log local (synced = 0 por padrão). */
export async function saveEntryLog(log) {
  const record = {
    ...log,
    synced: log.synced ?? 0,
    created_at: log.created_at || new Date().toISOString(),
  }
  const id = await db.entry_logs.add(record)
  return { ...record, id }
}

/** Retorna logs ainda não sincronizados, em ordem cronológica. */
export async function getPendingLogs() {
  return db.entry_logs
    .where('synced')
    .equals(0)
    .sortBy('id')
}

/** Marca logs como sincronizados. */
export async function markLogsSynced(ids) {
  if (!ids || ids.length === 0) return 0
  await db.entry_logs.where('id').anyOf(ids).modify({ synced: 1 })
  return ids.length
}

// ────────────────────────────────────────────────
// Limpeza
// ────────────────────────────────────────────────

/** Limpa tickets e entry_logs de um evento específico. */
export async function clearEventData(eventId) {
  if (eventId) {
    await db.tickets.where('event_id').equals(eventId).delete()
    await db.entry_logs.filter((l) => l.event_id === eventId).delete()
  }
}

/** Limpa toda a base local (tickets, logs e meta). */
export async function clearAll() {
  await db.tickets.clear()
  await db.entry_logs.clear()
  await db.meta.clear()
}

export async function getDBStats() {
  const tickets = await db.tickets.count()
  const pending = await db.entry_logs.where('synced').equals(0).count()
  const totalLogs = await db.entry_logs.count()
  return { tickets, pending_logs: pending, total_logs: totalLogs }
}
