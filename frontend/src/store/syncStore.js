import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { syncWithServer } from '../services/syncService'
import { getLastSync, getPendingLogs } from '../services/localDB'

export const useSyncStore = create(
  persist(
    (set, get) => ({
      lastSyncAt: null,
      isSyncing: false,
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      pendingLogs: 0,
      syncError: null,

      sync: async () => {
        if (get().isSyncing) return null
        set({ isSyncing: true, syncError: null })
        try {
          const result = await syncWithServer()
          const ts = await getLastSync()
          const pending = await getPendingLogs()
          set({ lastSyncAt: ts, isSyncing: false, pendingLogs: pending.length })
          return result
        } catch (err) {
          set({ isSyncing: false, syncError: err?.message || 'Erro de sincronização.' })
          throw err
        }
      },

      setOnline: (online) => set({ isOnline: !!online }),

      setPendingCount: (n) => set({ pendingLogs: Number(n) || 0 }),

      /** Alias legado */
      setPending: (n) => set({ pendingLogs: Number(n) || 0 }),

      /** True se o último sync foi há mais de 2 horas (nunca antes do primeiro sync) */
      isStale: () => {
        const ts = get().lastSyncAt
        if (!ts) return false
        return Date.now() - new Date(ts).getTime() > 2 * 60 * 60 * 1000
      },
    }),
    { name: 've_sync', partialize: (s) => ({ lastSyncAt: s.lastSyncAt }) }
  )
)
