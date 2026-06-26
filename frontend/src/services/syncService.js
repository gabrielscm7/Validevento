import api from './api'
import { db, getLastSync, setLastSync, getTerminalId, getEventId } from './localDB'

/** Envia logs pendentes e baixa snapshot incremental */
export async function syncWithServer(forceFullSync = false) {
  const eventId    = await getEventId()
  const terminalId = await getTerminalId()
  if (!eventId) throw new Error('Nenhum evento configurado localmente.')

  // ── 1. Enviar logs offline pendentes ──────────────────────────
  const pendingLogs = await db.entry_logs
    .where('synced').equals(0)
    .toArray()

  if (pendingLogs.length > 0) {
    await api.post('/api/sync/logs', {
      event_id:    eventId,
      terminal_id: terminalId,
      logs:        pendingLogs,
    })
    // Marcar como sincronizados
    const ids = pendingLogs.map((l) => l.id)
    await db.entry_logs.where('id').anyOf(ids).modify({ synced: 1 })
  }

  // ── 2. Baixar snapshot incremental ────────────────────────────
  const lastSync = forceFullSync ? null : await getLastSync()
  const params   = { event_id: eventId }
  if (lastSync) params.since = lastSync

  const { data: snapshot } = await api.get('/api/sync/snapshot', { params })

  // ── 3. Mesclar tickets na base local ──────────────────────────
  for (const ticket of snapshot.tickets) {
    const local = await db.tickets
      .where('ticket_code').equals(ticket.ticket_code).first()

    // RN-04 client-side: não sobrescreve status validated local
    if (!local || local.status !== 'validated') {
      await db.tickets.put({ ...ticket })
    }
  }

  // ── 4. Atualizar timestamp ─────────────────────────────────────
  await setLastSync(snapshot.last_sync_at)

  // ── 5. Heartbeat para registrar o terminal como online ─────────
  if (terminalId) {
    api.post('/api/sync/heartbeat', {
      event_id:    eventId,
      terminal_id: terminalId,
    }).catch(() => { /* silencioso — offline */ })
  }

  return {
    tickets_updated: snapshot.total,
    logs_sent:       pendingLogs.length,
    last_sync_at:    snapshot.last_sync_at,
  }
}
