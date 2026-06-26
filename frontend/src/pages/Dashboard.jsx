import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTerminalStore } from '../store/terminalStore'
import api from '../services/api'
import { SummaryCards } from '../components/dashboard/SummaryCards'
import { EntryChart } from '../components/dashboard/EntryChart'
import { BatchTable } from '../components/dashboard/BatchTable'
import { AlertsFeed } from '../components/dashboard/AlertsFeed'
import { LiveFeed } from '../components/dashboard/LiveFeed'
import TicketsTab from '../components/dashboard/TicketsTab'
import { ThemeToggle } from '../components/ThemeToggle'

const REFRESH_MS = 30000

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const { eventId, ensureEvent } = useTerminalStore()
  const navigate = useNavigate()

  const [summary, setSummary] = useState(null)
  const [batches, setBatches] = useState(null)
  const [flow, setFlow] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [terminals, setTerminals] = useState(null)
  const [liveFeed, setLiveFeed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => { ensureEvent() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!eventId) return
    let mounted = true

    async function fetchAll() {
      setError(null)
      try {
        const [s, b, f, a, t, l] = await Promise.all([
          api.get('/api/dashboard/summary', { params: { event_id: eventId } }),
          api.get('/api/dashboard/batches', { params: { event_id: eventId } }),
          api.get('/api/dashboard/flow', { params: { event_id: eventId } }),
          api.get('/api/dashboard/alerts', { params: { event_id: eventId } }),
          api.get('/api/dashboard/terminals', { params: { event_id: eventId } }),
          api.get('/api/dashboard/live-feed', { params: { event_id: eventId } }),
        ])
        if (!mounted) return
        setSummary(s.data)
        setBatches(b.data)
        setFlow(f.data)
        setAlerts(a.data)
        setTerminals(t.data)
        setLiveFeed(l.data)
      } catch (e) {
        if (!mounted) return
        setError(e.response?.data?.error ?? 'Erro ao carregar dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchAll()
    const interval = setInterval(fetchAll, REFRESH_MS)
    return () => { mounted = false; clearInterval(interval) }
  }, [eventId])

  const handleReset = useCallback(async () => {
    if (!window.confirm('Tem certeza? Isso vai apagar TODOS os ingressos, logs e terminais deste evento.')) return
    if (!eventId) return
    setResetting(true)
    try {
      await api.post('/api/admin/reset', { event_id: eventId })
      setSummary(null); setBatches(null); setFlow(null)
      setAlerts(null); setTerminals(null); setLiveFeed(null)
      setError('Dados resetados. Recarregue a página para ver.')
    } catch {
      setError('Erro ao resetar dados.')
    } finally {
      setResetting(false)
    }
  }, [eventId])

  const handleExport = async () => {
    if (!eventId) return
    setExporting(true)
    try {
      const res = await api.get('/api/dashboard/export', {
        params: { event_id: eventId },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `logs-evento-${eventId.slice(0, 8)}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('Erro ao exportar CSV')
    } finally {
      setExporting(false)
    }
  }

  const onlineTerminals = terminals?.filter((t) => t.online) ?? []
  const offlineTerminals = terminals?.filter((t) => !t.online) ?? []

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">🎟️</span>
          <div>
            <h1 className="font-bold text-foreground text-lg leading-tight">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Validevento · {user?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Atualizado há {new Date().toLocaleTimeString('pt-BR')}
          </span>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            {exporting ? 'Exportando…' : '📥 Exportar CSV'}
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="btn-danger py-1.5 px-3 text-xs"
          >
            {resetting ? 'Resetando…' : '🗑️ Resetar dados'}
          </button>
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/admin/config')} className="btn-ghost py-1.5 px-2 text-xs">
              ⚙️ Config
            </button>
          )}
          <ThemeToggle />
          <button onClick={() => { logout(); navigate('/login') }} className="btn-ghost py-1.5 px-2 text-xs">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <SummaryCards data={summary} loading={loading} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EntryChart data={flow} loading={loading} />
          <BatchTable data={batches} loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AlertsFeed data={alerts} loading={loading} />
          <LiveFeed data={liveFeed} loading={loading} />
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Terminais ativos</h3>
          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          ) : !terminals || terminals.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhum terminal registrado</p>
          ) : (
            <div className="space-y-2">
              {terminals.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      t.online ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.online ? 'Online' : 'Offline'}
                        {t.last_sync_at ? ` · Sync: ${new Date(t.last_sync_at).toLocaleTimeString('pt-BR')}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    t.online ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
                  }`}>
                    {t.online ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))}
              {onlineTerminals.length > 0 && (
                <p className="text-xs text-muted-foreground pt-2">
                  {onlineTerminals.length} online · {offlineTerminals.length} offline
                </p>
              )}
            </div>
          )}
        </div>

        <TicketsTab eventId={eventId} />
      </main>
    </div>
  )
}
