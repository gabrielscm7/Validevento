import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useTerminalStore } from '../../store/terminalStore'
import { useValidation } from '../../hooks/useValidation'
import { syncWithServer } from '../../services/syncService'
import { getMeta } from '../../services/localDB'
import api from '../../services/api'
import { QRScanner } from '../../components/QRScanner'
import { SearchPanel } from '../../components/SearchPanel'
import { ValidationResult } from '../../components/ValidationResult'
import { SyncStatus } from '../../components/SyncStatus'
import { MasterTicketModal } from '../../components/MasterTicketModal'
import { MasterTicketButton } from '../../components/MasterTicketButton'
import Logo from '../../components/Logo'
import { initials } from '../../lib/format'
import { setLastEventId } from '../../lib/lastEvent'
import { isValidUUIDv4 } from '../../lib/uuid'

const DEFAULT_CONFIG = {
  checkout_enabled: false,
  master_ticket_enabled: false,
}

export default function Terminal() {
  const { eventId: eventIdParam } = useParams()
  const eventId = eventIdParam || import.meta.env.VITE_EVENT_ID || null
  const navigate = useNavigate()

  const { user, logout } = useAuthStore()
  const { initTerminal, setLastResult } = useTerminalStore()
  const { validateTicket, checkoutTicket, validateManual } = useValidation()

  const [eventName, setEventName] = useState('Evento')
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [masterTicket, setMasterTicket] = useState(null)
  const [mode, setMode] = useState('checkin') // checkin | checkout
  const [scanReady, setScanReady] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [showMaster, setShowMaster] = useState(false)
  const [result, setResult] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const lockRef = useRef(false)

  const refreshFromLocal = useCallback(async () => {
    const cfg = (await getMeta('event_config')) || DEFAULT_CONFIG
    setConfig(cfg)
    setMasterTicket(await getMeta('master_ticket'))
    if (cfg.checkout_enabled === false) setMode('checkin')
  }, [])

  const runSync = useCallback(async () => {
    setSyncing(true)
    try { await syncWithServer() } catch { /* offline ok */ }
    await refreshFromLocal()
    setSyncing(false)
  }, [refreshFromLocal])

  useEffect(() => {
    if (!eventId) return
    if (!isValidUUIDv4(eventId)) {
      setEventName('Link inválido')
      return
    }
    let mounted = true
    setLastEventId(eventId)
    initTerminal(eventId)

    api.get(`/api/events/${eventId}`)
      .then(({ data }) => { if (mounted && data?.name) setEventName(data.name) })
      .catch(() => {})

    refreshFromLocal()
    if (typeof navigator !== 'undefined' && navigator.onLine) runSync()
    return () => { mounted = false }
  }, [eventId, initTerminal, refreshFromLocal, runSync])

  // Fullscreen mobile-first
  useEffect(() => {
    if (typeof document === 'undefined') return
    try {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } catch { /* ignore */ }
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  const handleScan = useCallback(async (text) => {
    if (!text || lockRef.current || !scanReady) return
    lockRef.current = true
    try {
      const res = mode === 'checkout' && config.checkout_enabled
        ? await checkoutTicket(text)
        : await validateTicket(text)
      setLastResult(res)
      setResult(res)
    } finally {
      // pequeno delay para não reler o mesmo código imediatamente
      setTimeout(() => { lockRef.current = false }, 2200)
    }
  }, [mode, config.checkout_enabled, scanReady, checkoutTicket, validateTicket, setLastResult])

  const handleManualConfirm = useCallback(async (item) => {
    setShowSearch(false)
    const res = await validateManual(item.ticket_id || item.id)
    setLastResult(res)
    setResult(res)
  }, [validateManual, setLastResult])

  const handleDismiss = useCallback(() => {
    setResult(null)
    setScanReady(true)
  }, [])

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  const modeLabel = config.checkout_enabled
    ? mode === 'checkout' ? 'SAÍDA' : 'ENTRADA'
    : null

  if (!isValidUUIDv4(eventId)) {
    return (
      <div className="terminal-root">
        <header className="terminal-topbar">
          <Logo size={26} light />
          <span className="avatar" title={user?.name}>{initials(user?.name)}</span>
        </header>
        <div className="terminal-context">Link inválido · Terminal de Portaria</div>
        <main className="terminal-main" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', color: '#fff', maxWidth: 360 }}>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Link do evento inválido</p>
            <p style={{ color: 'rgba(255,255,255,.65)', fontSize: 14, lineHeight: 1.5 }}>
              Esse endereço não corresponde a um evento válido. Use o link enviado pela equipe
              (ex.: <span className="mono" style={{ wordBreak: 'break-all' }}>https://www.validevento.com.br/terminal/&lt;código-do-evento&gt;</span>).
            </p>
            <Link to="/sem-evento" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-block' }}>
              Informar outro link
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="terminal-root">
      {/* 1. TopBar escura */}
      <header className="terminal-topbar">
        <Logo size={26} light />
        <SyncStatus showForce={false} />
        <span className="avatar" title={user?.name}>{initials(user?.name)}</span>
      </header>

      {/* 2. Subtítulo */}
      <div className="terminal-context">
        {eventName} · Terminal de Portaria
        {modeLabel ? ` · modo ${modeLabel}` : ''}
      </div>

      {/* 3. Scanner */}
      <main className="terminal-main">
        {result ? (
          <ValidationResult result={result} onDismiss={handleDismiss} />
        ) : (
          <>
            <QRScanner onScan={handleScan} active={scanReady} />
            {syncing && <p className="scan-hint">sincronizando com o servidor…</p>}
          </>
        )}
      </main>

      {/* 4. Rodapé */}
      <footer className="terminal-foot">
        <button
          type="button"
          className="t-btn"
          onClick={() => setShowSearch(true)}
        >
          🔍 Busca manual
        </button>
        <MasterTicketButton
          enabled={!!config.master_ticket_enabled}
          onClick={() => setShowMaster(true)}
        />
        {config.checkout_enabled && (
          <button
            type="button"
            className={`t-btn ${mode === 'checkout' ? 'blue' : ''}`}
            onClick={() => setMode((m) => (m === 'checkout' ? 'checkin' : 'checkout'))}
          >
            {mode === 'checkout' ? 'Check-in' : 'Check-out'}
          </button>
        )}
        <button
          type="button"
          className="t-btn"
          onClick={handleLogout}
          aria-label="Sair"
        >
          ⏻
        </button>
      </footer>

      {/* Drawer busca manual */}
      <SearchPanel open={showSearch} onClose={() => setShowSearch(false)} onConfirm={handleManualConfirm} />

      {/* Modal ingresso master */}
      <MasterTicketModal
        open={showMaster}
        onClose={() => setShowMaster(false)}
        usesCount={masterTicket?.uses_count}
        maxUses={masterTicket?.max_uses}
        onResult={(r) => { setLastResult(r); setResult(r) }}
      />
    </div>
  )
}
