import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { syncWithServer } from '../services/syncService'
import { getLastSync } from '../services/localDB'

export const useSyncStore = create(
  persist(
    (set, get) => ({
      lastSyncAt:   null,
      isSyncing:    false,
      syncError:    null,
      pendingLogs:  0,

      setLastSync: (ts)  => set({ lastSyncAt: ts }),
      setPending:  (n)   => set({ pendingLogs: n }),

      sync: async (forceFullSync = false) => {
        if (get().isSyncing) return
        set({ isSyncing: true, syncError: null })
        try {
          const result = await syncWithServer(forceFullSync)
          const ts = await getLastSync()
          set({ lastSyncAt: ts, isSyncing: false })
          return result
        } catch (err) {
          set({ isSyncing: false, syncError: err.message })
          throw err
        }
      },

      /** True se último sync há mais de 2 horas (nunca mostra stale antes do primeiro sync) */
      isStale: () => {
        const ts = get().lastSyncAt
        if (!ts) return false
        return Date.now() - new Date(ts).getTime() > 2 * 60 * 60 * 1000
      },
    }),
    { name: 've_sync', partialize: (s) => ({ lastSyncAt: s.lastSyncAt }) }
  )
)
