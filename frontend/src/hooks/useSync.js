import { useEffect, useRef } from 'react'
import { useSyncStore }  from '../store/syncStore'

const INTERVAL_MS = 60 * 60 * 1000 // 60 minutos

export function useSync() {
  const { sync, isSyncing, lastSyncAt, syncError, isStale } = useSyncStore()
  const intervalRef = useRef(null)

  useEffect(() => {
    // Sync inicial ao montar
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
  }, [sync])

  return { sync, isSyncing, lastSyncAt, syncError, isStale: isStale() }
}
