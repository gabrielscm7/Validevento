import { useCallback, useEffect, useState } from 'react'
import { syncWithServer } from '../services/syncService'
import { getLastSync } from '../services/localDB'

/**
 * Detecta online/offline (navigator.onLine + eventos de rede).
 * Ao ficar online, dispara syncWithServer() automaticamente.
 *
 * Retorna: { isOnline, lastSyncAt, syncNow }
 */
export function useOffline() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [lastSyncAt, setLastSyncAt] = useState(null)

  const refreshLastSync = useCallback(async () => {
    const ts = await getLastSync()
    setLastSyncAt(ts)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    refreshLastSync()

    const goOnline = () => {
      setIsOnline(true)
      syncWithServer().catch(() => {})
      refreshLastSync()
    }
    const goOffline = () => setIsOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [refreshLastSync])

  const syncNow = useCallback(async () => {
    await syncWithServer()
    await refreshLastSync()
  }, [refreshLastSync])

  return { isOnline, lastSyncAt, syncNow }
}
