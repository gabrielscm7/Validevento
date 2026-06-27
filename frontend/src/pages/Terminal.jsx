import { useState, useEffect, useCallback } from 'react'
import { useAuthStore }      from '../store/authStore'
import { useTerminalStore }  from '../store/terminalStore'
import { useNavigate }       from 'react-router-dom'
import { useSync }           from '../hooks/useSync'
import { useValidation }     from '../hooks/useValidation'
import { useOffline }        from '../hooks/useOffline'
import { QRScanner }         from '../components/QRScanner'
import { ElginScanner }      from '../components/ElginScanner'
import { SearchPanel }       from '../components/SearchPanel'
import { ValidationResult }  from '../components/ValidationResult'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { SyncStatus }        from '../components/SyncStatus'
import { ThemeToggle }       from '../components/ThemeToggle'

const METHODS = [
  { id: 'qr',      label: '📷 Câmera',      desc: 'Leia o QRCode do ingresso com a câmera do celular' },
  { id: 'scanner', label: '📟 Leitor USB',   desc: 'Use o leitor Elgin EL250' },
  { id: 'search',  label: '🔍 Busca Manual', desc: 'Digite o nome do participante' },
]

export default function Terminal() {
  const { user, logout }            = useAuthStore()
  const { terminalName, ensureEvent, initTerminal } = useTerminalStore()
  const navigate                     = useNavigate()

  useEffect(() => { initTerminal(); ensureEvent() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const { sync, isSyncing }   = useSync()
  const { lookupTicketCode, validateTicketCode } = useValidation()
  const isOffline             = useOffline()

  const [method, setMethod]   = useState(null)
  const [result, setResult]   = useState(null)
  const [scanning, setScanning] = useState(true)
  const [pendingTicket, setPendingTicket] = useState(null)
  const [validating, setValidating] = useState(false)

  const handleScan = useCallback(async (text) => {
    if (!scanning) return
    setScanning(false)
    const ticket = await lookupTicketCode(text)

    if (ticket.status === 'blocked' || ticket.status === 'not_found' || ticket.status === 'error') {
      setResult(ticket)
    } else {
      setPendingTicket(ticket)
    }
  }, [scanning, lookupTicketCode])

  const handleConfirm = useCallback(async () => {
    if (!pendingTicket) return
    setValidating(true)
    const res = await validateTicketCode(pendingTicket.ticket_code)
    setPendingTicket(null)
    setValidating(false)
    setResult(res)
  }, [pendingTicket, validateTicketCode])

  const handleCancel = useCallback(() => {
    setPendingTicket(null)
    setScanning(true)
  }, [])

  const handleDismiss = () => {
    setResult(null)
    setScanning(true)
  }

  const canForceSync = user?.role === 'admin' || user?.role === 'supervisor'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!method) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 glass border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎟️</span>
            <p className="font-semibold text-sm text-foreground">{terminalName ?? 'Terminal de Portaria'}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={handleLogout} className="btn-ghost py-1.5 px-2 text-xs">Sair</button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
          <h2 className="text-xl font-bold text-foreground mb-2">Selecione o método</h2>
          <p className="text-muted-foreground text-sm mb-8 text-center">Escolha como deseja validar os ingressos</p>

          <div className="w-full space-y-3">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className="w-full card p-5 flex items-center gap-4 text-left hover:bg-secondary/80 transition-all active:scale-[0.98]"
              >
                <span className="text-3xl">{m.label.split(' ')[0]}</span>
                <div>
                  <p className="font-semibold text-foreground">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
                <span className="ml-auto text-muted-foreground/50">→</span>
              </button>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 glass border-b px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setMethod(null)} className="text-muted-foreground hover:text-foreground text-lg flex-shrink-0">
            ←
          </button>
          <span className="text-xl">🎟️</span>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate leading-tight">
              {terminalName ?? 'Terminal de Portaria'}
            </p>
            <SyncStatus showForce={canForceSync} />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isOffline && <span className="badge-red text-xs">OFFLINE</span>}
          {canForceSync && (
            <button onClick={() => sync()} disabled={isSyncing} className="btn-secondary py-1.5 px-3 text-xs">
              {isSyncing ? '⟳' : '⟳ Sync'}
            </button>
          )}
          <ThemeToggle />
          <button onClick={handleLogout} className="btn-ghost py-1.5 px-2 text-xs">Sair</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center p-4 gap-5 max-w-lg mx-auto w-full">
        {method === 'qr' && (
          <>
            <p className="text-muted-foreground text-sm text-center mt-1">Aponte a câmera para o QRCode do ingresso</p>
            <QRScanner onScan={handleScan} active={scanning} />
          </>
        )}

        {method === 'scanner' && (
          <>
            <p className="text-muted-foreground text-sm text-center mt-1">Leia o código com o leitor Elgin EL250</p>
            <ElginScanner onScan={handleScan} active={scanning} />
          </>
        )}

        {method === 'search' && (
          <>
            <p className="text-muted-foreground text-sm text-center mt-1">Busque pelo nome do participante</p>
            <SearchPanel onResult={(r) => { setResult(r); setMethod(null) }} />
          </>
        )}
      </main>

      {result && <ValidationResult result={result} onDismiss={handleDismiss} />}
      {pendingTicket && (
        <ConfirmationDialog
          ticket={pendingTicket}
          loading={validating}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      <footer className="py-2 text-center text-xs text-muted-foreground/60">
        {user?.name} · {user?.role}
      </footer>
    </div>
  )
}
