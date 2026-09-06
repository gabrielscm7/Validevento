import { useEffect } from 'react'
import { useSyncStore }  from '../store/syncStore'
import { useTerminalStore } from '../store/terminalStore'

/**
 * Sincronização reativa.
 * O agendamento automático (60 min + reconexão) é feito pelo syncService;
 * aqui apenas disparamos um sync inicial quando o evento é configurado.
 */
export function useSync() {
  const { sync, isSyncing, lastSyncAt, syncError, isStale } = useSyncStore()
  const eventId = useTerminalStore((s) => s.eventId)

  useEffect(() => {
    if (!eventId) return
    sync().catch(() => {})
  }, [sync, eventId])

  return { sync, isSyncing, lastSyncAt, syncError, isStale: isStale() }
}
