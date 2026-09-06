import api from './api'
import {
  db,
  getEventId,
  getTerminalId,
  getLastSync,
  setLastSync,
  setTerminalId,
  saveMeta,
  getMeta,
  getTicketByCode,
  getPendingLogs,
  markLogsSynced,
} from './localDB'

const SYNC_INTERVAL_MS = 60 * 60 * 1000 // 60 minutos

let running = false
let schedulerStarted = false

function toServerLog(l) {
  return {
    local_id: l.id,
    ticket_code: l.ticket_code,
    entry_type: l.entry_type,
    beneficiary: l.beneficiary,
    is_duplicate: l.is_duplicate === true,
    checkout_at: l.checkout_at || undefined,
    created_at: l.created_at,
  }
}

/**
 * Sincroniza o terminal com o servidor:
 *  1. Heartbeat (registra terminal online)
 *  2. Envia entry_logs pendentes
 *  3. Baixa snapshot incremental (tickets alterados desde last_sync_at)
 *  4. Salva event_config e master_ticket localmente
 *  5. Mescla tickets com proteção a validação local
 */
export async function syncWithServer() {
  if (running) return null
  running = true
  try {
    const eventId = await getEventId()
    if (!eventId) return null

    // 1. Heartbeat + recuperação de terminal_id
    let terminalId = await getTerminalId()
    try {
      const { data } = await api.post('/api/sync/heartbeat', {
        event_id: eventId,
        terminal_id: terminalId || undefined,
        name: (typeof navigator !== 'undefined' && navigator.userAgent?.slice(0, 80)) || 'Terminal Móvel',
      })
      if (data?.terminal_id) {
        terminalId = data.terminal_id
        await setTerminalId(terminalId)
      }
    } catch {
      // offline — segue sem heartbeat
    }

    // 2. Enviar logs offline pendentes
    let logsSent = 0
    const pending = await getPendingLogs()
    if (pending.length > 0) {
      try {
        const { data } = await api.post('/api/sync/logs', {
          event_id: eventId,
          terminal_id: terminalId || undefined,
          logs: pending.map(toServerLog),
        })
        // Marcamos como sincronizados todos os logs enviados, exceto os que
        // o servidor reportou como erro (para não reenviar em loop).
        const errorIds = new Set((data?.errors ?? []).map((e) => e.local_id))
        const syncedIds = pending.filter((l) => !errorIds.has(l.id)).map((l) => l.id)
        await markLogsSynced(syncedIds)
        logsSent = pending.length
      } catch (e) {
        // Falha de rede: mantém os logs pendentes para a próxima tentativa
        console.warn('Falha ao enviar logs offline:', e?.message || e)
      }
    }

    // 3. Snapshot incremental
    const lastSync = await getLastSync()
    const params = { event_id: eventId }
    if (lastSync) params.since = lastSync

    const { data: snapshot } = await api.get('/api/sync/snapshot', {
      params: { ...params, terminal_id: terminalId || undefined },
    })

    // 4. Config + master ticket no meta
    if (snapshot.event_config) await saveMeta('event_config', snapshot.event_config)
    await saveMeta('master_ticket', snapshot.master_ticket || null)

    // 5. Mesclar tickets
    for (const ticket of snapshot.tickets || []) {
      const local = await getTicketByCode(ticket.ticket_code)
      if (!local) {
        await db.tickets.put({ ...ticket, event_id: eventId })
        continue
      }
      // Proteção contra race condition: validação local vence
      if (local.status === 'validated') continue
      // RN-04 client-side: versão local mais nova (ex.: bloqueio) não é sobrescrita
      const localUpdated = local.updated_at ? new Date(local.updated_at).getTime() : 0
      const serverUpdated = ticket.updated_at ? new Date(ticket.updated_at).getTime() : 0
      if (localUpdated > serverUpdated) continue
      await db.tickets.put({ ...local, ...ticket, event_id: eventId })
    }

    // 6. Atualiza timestamp do último sync
    await setLastSync(snapshot.last_sync_at)

    return {
      tickets_updated: snapshot.total || 0,
      logs_sent: logsSent,
      last_sync_at: snapshot.last_sync_at,
    }
  } finally {
    running = false
  }
}

/** Alias público para chamada manual (força um snapshot completo). */
export async function forcSync() {
  return syncWithServer()
}

/**
 * Agenda o sync automático:
 *  - a cada 60 minutos
 *  - ao detectar reconexão de rede (window online)
 */
export function startAutoSync() {
  if (schedulerStarted) return
  schedulerStarted = true

  setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncWithServer().catch(() => {})
    }
  }, SYNC_INTERVAL_MS)

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      syncWithServer().catch(() => {})
    })
  }
}

export { getMeta }

// Inicia o agendador assim que o módulo for carregado no navegador
if (typeof window !== 'undefined') {
  startAutoSync()
}
