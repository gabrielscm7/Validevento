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

  // ── 3. Mesclar tickets na base local com resolução de conflito ─
  // Os logs offline já foram processados pelo servidor (passo 1),
  // mas o snapshot (passo 2) pode ainda não refletir essas mudanças
  // pois o param `since` filtra por updated_at anterior ao sync.
  // Isto é intencional — a regra RN-04 preserva o status validated local
  // e o próximo sync capturará as atualizações do servidor.
  for (const ticket of snapshot.tickets) {
    const local = await db.tickets
      .where('ticket_code').equals(ticket.ticket_code).first()

    if (!local) {
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
      continue
    }

    // Servidor tem versão mais recente — atualizar
    await db.tickets.put({
      id: local.id,
      ...ticket,
    })
  }

  // ── 4. Atualizar timestamp ─────────────────────────────────────
  await setLastSync(snapshot.last_sync_at)

  // ── 5. Heartbeat para registrar o terminal como online ─────────
  if (terminalId) {
    try {
      const { data } = await api.post('/api/sync/heartbeat', {
        event_id:    eventId,
        terminal_id: terminalId,
        name:        navigator.userAgent?.slice(0, 80) || 'Terminal Móvel',
      })
      if (data.terminal_id && data.terminal_id !== terminalId) {
        const { setTerminalId } = await import('./localDB')
        await setTerminalId(data.terminal_id)
      }
    } catch { /* silencioso — offline */ }
  }

  return {
    tickets_updated: snapshot.total,
    logs_sent:       pendingLogs.length,
    last_sync_at:    snapshot.last_sync_at,
  }
}
