import { useEffect, useRef } from 'react'
import { useSyncStore }  from '../store/syncStore'
import { useTerminalStore } from '../store/terminalStore'

const INTERVAL_MS = 60 * 60 * 1000 // 60 minutos

export function useSync() {
  const { sync, isSyncing, lastSyncAt, syncError, isStale } = useSyncStore()
  const eventId = useTerminalStore((s) => s.eventId)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!eventId) return

    // Sync inicial ao montar (só quando evento estiver configurado)
    sync().catch(() => {})

    // Sync automático a cada 60 min
    intervalRef.current = setInterval(() => {
      if (navigator.onLine) sync().catch(() => {})
    }, INTERVAL_MS)

    // Sync ao reconectar
    const onOnline = () => sync().catch(() => {})
    window.addEventListener('online', onOnline)

    return () => {
      clearInterval(intervalRef.current)
      window.removeEventListener('online', onOnline)
    }
  }, [sync, eventId])

  return { sync, isSyncing, lastSyncAt, syncError, isStale: isStale() }
}
