import { useOffline } from '../hooks/useOffline'
import { useSyncStore } from '../store/syncStore'
import { formatTime } from '../lib/format'

function formatSync(iso) {
  if (!iso) return '—'
  // Aceita "HH:MM" pronto ou ISO
  if (/^\d{1,2}:\d{2}$/.test(iso)) return iso
  return formatTime(iso)
}

/**
 * Badge de status de sincronização do terminal.
 * Props opcionais permitem override em testes/preview.
 */
export function SyncStatus({ showForce = false, isOnline: onlineProp, lastSyncAt: lastSyncProp, onSync }) {
  const { isOnline: hookOnline, syncNow } = useOffline()
  const { lastSyncAt: hookLastSync, isSyncing } = useSyncStore()

  const isOnline = onlineProp !== undefined ? onlineProp : hookOnline
  const lastSyncAt = lastSyncProp !== undefined ? lastSyncProp : hookLastSync

  const handleSync = async () => {
    if (onSync) return onSync()
    await syncNow()
  }

  const syncLabel = lastSyncAt ? formatSync(lastSyncAt) : '—'

  return (
    <div className="flex items-center gap-2" data-testid="sync-status">
      <span
        className={`dot ${isOnline ? 'dot-green pulse' : 'dot-yellow'}`}
        style={isSyncing ? { animation: 'vvspin .7s linear infinite', borderRadius: 0 } : undefined}
      />
      <span
        style={{
          fontSize: 12,
          color: isOnline ? 'rgba(255,255,255,.85)' : '#eab308',
          whiteSpace: 'nowrap',
        }}
        onClick={() => !isSyncing && isOnline && handleSync()}
        role={isOnline ? 'button' : undefined}
        title={isOnline ? 'Toque para sincronizar agora' : 'Sem conexão'}
      >
        {isSyncing ? 'sincronizando…' : isOnline ? `Online · sync ${syncLabel}` : `offline · sync ${syncLabel}`}
      </span>

      {showForce && isOnline && !isSyncing && (
        <button
          type="button"
          className="btn-ghost"
          style={{ fontSize: 11, padding: '2px 8px', color: 'rgba(255,255,255,.6)' }}
          onClick={() => { handleSync() }}
        >
          ⟳ sincronizar
        </button>
      )}
    </div>
  )
}

export default SyncStatus
