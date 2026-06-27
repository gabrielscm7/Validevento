import { useOffline }   from '../hooks/useOffline'
import { useSyncStore } from '../store/syncStore'

function formatTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function SyncStatus({ showForce = false }) {
  const isOffline = useOffline()
  const { lastSyncAt, isSyncing, syncError, isStale, sync } = useSyncStore()

  const stale = isStale()

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isOffline ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'
        }`}
      />

      <span className={
        isOffline ? 'text-red-600 dark:text-red-400' :
        stale     ? 'text-amber-600 dark:text-amber-400' :
                    'text-muted-foreground'
      }>
        {isOffline
          ? `Modo offline — último sync: ${formatTime(lastSyncAt)}`
          : stale
          ? `Base desatualizada — sync: ${formatTime(lastSyncAt)}`
          : lastSyncAt
          ? `Sync: ${formatTime(lastSyncAt)}`
          : 'Sincronizando...'}
      </span>

      {syncError && (
        <span className="text-red-600 dark:text-red-400 truncate max-w-[120px]" title={syncError}>
          ⚠ Erro
        </span>
      )}

      {showForce && !isOffline && (
        <button
          onClick={() => sync()}
          disabled={isSyncing}
          className="btn-ghost py-0.5 px-2 text-xs ml-1"
          title="Sincronizar agora"
        >
          {isSyncing ? '⟳ Sync…' : '⟳ Sync'}
        </button>
      )}
    </div>
  )
}
