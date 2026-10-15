import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useTerminalStore } from '../../store/terminalStore'
import { useValidation } from '../../hooks/useValidation'
import { syncWithServer } from '../../services/syncService'
import { getMeta, saveMeta } from '../../services/localDB'
import api from '../../services/api'
import { QRScanner } from '../../components/QRScanner'
import { ScannerInput } from '../../components/ScannerInput'
import { ScannerSettings } from '../../components/ScannerSettings'
import { useExternalScanner } from '../../hooks/useExternalScanner'
import { SearchPanel } from '../../components/SearchPanel'
import { ValidationResult } from '../../components/ValidationResult'
import { ValidationConfirm } from '../../components/ValidationConfirm'
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

const SCANNER_SOURCE_KEY = 've_scanner_source'
const SOUND_KEY = 've_sound_enabled'

function readPref(key, fallback) {
  try {
    if (typeof window === 'undefined') return fallback
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writePref(key, value) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch { /* ignore */ }
}

export default function Terminal() {
  const { eventId: eventIdParam, slug: slugParam } = useParams()
  const navigate = useNavigate()

  const { user, logout } = useAuthStore()
  const { initTerminal, setLastResult, setGate } = useTerminalStore()
  const storeEventId = useTerminalStore((s) => s.eventId)
  const isGeneric = useTerminalStore((s) => s.isGeneric)
  const generic = isGeneric || !!slugParam
  const eventId = eventIdParam || storeEventId || import.meta.env.VITE_EVENT_ID || null
  const gateName = useTerminalStore((s) => s.gateName)
  const gateOpen = useTerminalStore((s) => s.gateOpen)
  const { validateTicket, checkoutTicket, validateManual, undoTicket, lookupTicketCode } = useValidation()

  const [eventName, setEventName] = useState('Evento')
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [masterTicket, setMasterTicket] = useState(null)
  const [mode, setMode] = useState('checkin') // checkin | checkout
  const [scanReady, setScanReady] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [showMaster, setShowMaster] = useState(false)
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(null) // { code, info, mode }
  const [busy, setBusy] = useState(false)
  const [lastUndo, setLastUndo] = useState(null) // último ingresso validável para desfazer
  const [syncing, setSyncing] = useState(false)
  const [gates, setGates] = useState([])
  const [showGatePicker, setShowGatePicker] = useState(false)
  const [scannerSource, setScannerSourceState] = useState(() => readPref(SCANNER_SOURCE_KEY, 'auto'))
  const [soundEnabled, setSoundEnabledState] = useState(() => readPref(SOUND_KEY, '1') !== '0')
  const lockRef = useRef(false)

  const setScannerSource = useCallback((value) => {
    setScannerSourceState(value)
    writePref(SCANNER_SOURCE_KEY, value)
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev
      writePref(SOUND_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  const refreshFromLocal = useCallback(async () => {
    const cfg = (await getMeta('event_config')) || DEFAULT_CONFIG
    setConfig(cfg)
    setMasterTicket(await getMeta('master_ticket'))
    const savedGate = await getMeta('terminal_gate')
    if (savedGate) {
      await setGate({
        gateId: savedGate.gate_id || null,
        gateName: savedGate.gate_name || null,
        gateOpen: !!savedGate.gate_id && savedGate.gate_open !== false,
      })
    }
    const cachedGates = await getMeta('event_gates')
    if (Array.isArray(cachedGates)) setGates(cachedGates)
    if (cfg.checkout_enabled === false) setMode('checkin')
  }, [setGate])

  const runSync = useCallback(async () => {
    setSyncing(true)
    try { await syncWithServer() } catch { /* offline ok */ }
    await refreshFromLocal()
    setSyncing(false)
  }, [refreshFromLocal])

  useEffect(() => {
    if (slugParam) useTerminalStore.getState().setGeneric({ slug: slugParam })
  }, [slugParam])

  useEffect(() => {
    if (!eventId) return
    if (!isValidUUIDv4(eventId)) {
      setEventName('Link inválido')
      return
    }
    let mounted = true
    setLastEventId(eventId)
    initTerminal(eventId).then(async (terminalId) => {
      try {
        const base = useTerminalStore.getState().genericBase()
        const gatesUrl = base ? `${base}/gates` : `/api/events/${eventId}/gates`
        const gateUrl = base
          ? `${base}/gate`
          : `/api/events/${eventId}/terminals/${terminalId}/gate`
        const [{ data: gateRows }, { data: current }] = await Promise.all([
          api.get(gatesUrl),
          api.get(gateUrl),
        ])
        setGates(gateRows || [])
        await saveMeta('event_gates', gateRows || [])
        if (current?.gate_id) {
          await setGate({
            gateId: current.gate_id,
            gateName: current.gate_name,
            gateOpen: !!current.gate_open,
          })
        } else {
          await setGate({ gateId: null, gateName: null, gateOpen: false })
        }
      } catch {
        const cachedGates = await getMeta('event_gates')
        if (Array.isArray(cachedGates)) setGates(cachedGates)
      }
    })

    if (generic) {
      getMeta('event_name').then((cachedName) => {
        if (mounted && cachedName) setEventName(cachedName)
      })
    } else {
      api.get(`/api/events/${eventId}`)
        .then(({ data }) => { if (mounted && data?.name) setEventName(data.name) })
        .catch(() => {})
    }

    refreshFromLocal()
    if (typeof navigator !== 'undefined' && navigator.onLine) runSync()
    return () => { mounted = false }
  }, [eventId, generic, initTerminal, refreshFromLocal, runSync, setGate])

  async function chooseGate(gate) {
    const terminalId = useTerminalStore.getState().terminalId
    try {
      const base = useTerminalStore.getState().genericBase()
      const url = base
        ? `${base}/gate`
        : `/api/events/${eventId}/terminals/${terminalId}/gate`
      await api.patch(url, { gate_id: gate.id })
      await setGate({ gateId: gate.id, gateName: gate.name, gateOpen: gate.status ? gate.status === 'open' : true })
      setShowGatePicker(false)
    } catch (error) {
      setResult({ status: 'error', reason: error?.response?.data?.details || 'Não foi possível selecionar o portão.' })
    }
  }

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

  // Leitura de QR/USB: congela o scanner e abre a tela de confirmação.
  const handleScan = useCallback(async (text) => {
    if (!text || lockRef.current || !scanReady || pending || result) return
    lockRef.current = true
    setScanReady(false)
    try {
      const info = await lookupTicketCode(text)
      if (!info || info.status === 'not_found') {
        setResult({ status: 'not_found', ticket_code: text })
        return
      }
      if (info.status === 'error') {
        setResult({ status: 'error', reason: info.reason })
        return
      }
      setPending({ code: text, info })
    } finally {
      setTimeout(() => { lockRef.current = false }, 600)
    }
  }, [scanReady, pending, result, lookupTicketCode])

  // Scanner USB (HID): lê código + Enter e dispara o mesmo fluxo.
  const { isScannerInput } = useExternalScanner({
    onScan: handleScan,
    enabled: scannerSource !== 'camera' && scanReady && !pending && !result,
  })

  // Auto-detecção: ao perceber um leitor USB (teclado rápido), desliga a
  // câmera automaticamente e passa a operar apenas pelo leitor físico.
  useEffect(() => {
    if (scannerSource === 'auto' && isScannerInput) setScannerSource('usb')
  }, [isScannerInput, scannerSource, setScannerSource])

  const handleManualConfirm = useCallback((item) => {
    setShowSearch(false)
    setScanReady(false)
    setPending({
      mode: 'manual',
      code: item.ticket_code,
      ticketId: item.ticket_id || item.id,
      info: {
        status: item.status,
        ticket_code: item.ticket_code,
        display_name: item.display_name,
        batch: item.batch,
      },
    })
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!pending || busy) return
    setBusy(true)
    try {
      let res
      if (pending.mode === 'manual') {
        res = await validateManual(pending.ticketId)
      } else if (mode === 'checkout' && config.checkout_enabled) {
        res = await checkoutTicket(pending.code)
      } else {
        res = await validateTicket(pending.code)
      }
      setLastResult(res)
      setPending(null)
      setResult(res)
      if (res?.status === 'authorized' || res?.status === 'checkout_registered') {
        setLastUndo({ ticket_code: res.ticket_code || pending.code, display_name: res.display_name })
      }
    } finally {
      setBusy(false)
    }
  }, [pending, busy, mode, config.checkout_enabled, validateManual, checkoutTicket, validateTicket, setLastResult])

  const handleCancel = useCallback(() => {
    setPending(null)
    setScanReady(true)
  }, [])

  const handleDismiss = useCallback(() => {
    setResult(null)
    setScanReady(true)
  }, [])

  const handleUndo = useCallback(async () => {
    const target = lastUndo
      || (result?.ticket_code ? { ticket_code: result.ticket_code, display_name: result.display_name } : null)
    if (!target || busy) return
    setBusy(true)
    try {
      const res = await undoTicket(target.ticket_code)
      setLastResult(res)
      setLastUndo(null)
      setResult(res)
    } finally {
      setBusy(false)
    }
  }, [lastUndo, result, busy, undoTicket, setLastResult])

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
        <div className="terminal-topbar-right">
          <button
            type="button"
            className="sound-toggle"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
            title={soundEnabled ? 'Desativar som' : 'Ativar som'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <SyncStatus showForce={false} />
          {!generic && <span className="avatar" title={user?.name}>{initials(user?.name)}</span>}
        </div>
      </header>

      {/* 2. Subtítulo */}
      <div className="terminal-context">
        {eventName}
        {gateName
          ? ` · ${gateName}`
          : gates.length > 0
            ? ''
            : ' · Portaria Única'}
        {gateName && !gateOpen && (
          <span style={{ color: 'rgba(255,200,0,0.8)', fontSize: 11 }}> (portão fechado)</span>
        )}
        {gates.length > 0 && (
          <button type="button" className="t-btn" onClick={() => setShowGatePicker(true)}>
            {gateName ? 'Trocar portão' : '⚠ Sem portão — toque para selecionar'}
          </button>
        )}
        {modeLabel ? ` · modo ${modeLabel}` : ''}
      </div>

      {/* 3. Scanner — sempre disponível, nunca bloqueado */}
      <main className="terminal-main">
        {pending ? (
          <ValidationConfirm
            ticket={pending.info}
            kind={pending.mode !== 'manual' && mode === 'checkout' && config.checkout_enabled ? 'checkout' : 'checkin'}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            busy={busy}
          />
        ) : result ? (
          <ValidationResult
            result={result}
            onDismiss={handleDismiss}
            onUndo={handleUndo}
            soundEnabled={soundEnabled}
          />
        ) : (
          <>
            <QRScanner onScan={handleScan} active={scanReady && scannerSource !== 'usb'} />
            <ScannerInput active={scannerSource !== 'camera'} />
            {scannerSource !== 'camera' && (
              <p className="scan-hint">
                {scannerSource === 'usb'
                  ? 'Aponte o leitor USB para o código'
                  : 'Escaneie o QR code ou use o leitor USB'}
              </p>
            )}
            {syncing && <p className="scan-hint">sincronizando com o servidor…</p>}
          </>
        )}
      </main>

      {/* 4. Rodapé */}
      <footer className="terminal-foot">
        <ScannerSettings value={scannerSource} onChange={setScannerSource} />
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
        {lastUndo && (
          <button
            type="button"
            className="t-btn"
            onClick={handleUndo}
            disabled={busy}
            title={`Desfazer validação de ${lastUndo.display_name || lastUndo.ticket_code}`}
          >
            ⟲ Desfazer
          </button>
        )}
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
          onClick={generic ? () => navigate('/login') : handleLogout}
          aria-label="Sair"
        >
          ⏻
        </button>
        {!generic && (user?.role === 'admin' || user?.role === 'master') && (
          <button
            type="button"
            className="t-btn"
            onClick={() => navigate(`/supervisor/${eventId}`)}
          >
            Dashboard
          </button>
        )}
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

      {showGatePicker && (
        <div className="terminal-overlay" role="dialog" aria-modal="true" aria-label="Selecionar portão">
          <div className="terminal-dialog">
            <h2>Selecione o portão</h2>
            <div className="grid gap-sm mt-3">
              {gates.map((gate) => (
                <button key={gate.id} type="button" className="btn btn-primary" onClick={() => chooseGate(gate)}>
                  {gate.name}{gate.status && gate.status !== 'open' ? ' (fechado)' : ''}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost mt-3" onClick={() => setShowGatePicker(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
