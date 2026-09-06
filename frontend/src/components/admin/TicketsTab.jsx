import { useState, useEffect } from 'react'
import api from '../../services/api'
import { Button } from '../ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

export default function TicketsTab({ eventId }) {
  const [mode, setMode] = useState('batch')
  const [ticketCodes, setTicketCodes] = useState('')
  const [batchName, setBatchName] = useState('')
  const [batchOptions, setBatchOptions] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!eventId) return
    let mounted = true
    api.get(`/api/events/${eventId}/dashboard/batches`)
      .then(({ data }) => { if (mounted) setBatchOptions(data) })
      .catch(() => {})
    return () => { mounted = false }
  }, [eventId])

  useEffect(() => {
    if (!eventId || mode !== 'batch' || !batchName.trim()) return
    let cancelled = false
    api.get(`/api/events/${eventId}/tickets`, { params: { batch: batchName.trim(), limit: 1 } })
      .then(({ data }) => { if (!cancelled) setPreview({ total: data.total }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [eventId, batchName, mode])

  async function handleCancel(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!eventId) return

    if (mode === 'individual') {
      const codes = ticketCodes.split('\n').map((s) => s.trim()).filter(Boolean)
      if (codes.length === 0) { setError('Digite ao menos um código de ingresso.'); return }

      const confirmed = window.confirm(`Confirmar cancelamento de ${codes.length} ingresso(s)?`)
      if (!confirmed) return

      setLoading(true)
      try {
        const { data } = await api.post('/api/admin/cancel-tickets', { event_id: eventId, ticket_codes: codes })
        setResult(data)
        setTicketCodes('')
      } catch (err) {
        setError(err.response?.data?.error ?? 'Erro ao cancelar ingressos')
      } finally {
        setLoading(false)
      }
    } else {
      if (!batchName.trim()) { setError('Selecione um lote.'); return }

      setLoading(true)
      try {
        const { data } = await api.post('/api/admin/cancel-tickets', { event_id: eventId, batch: batchName.trim() })
        setResult(data)
        setBatchName('')
        setPreview(null)
      } catch (err) {
        setError(err.response?.data?.error ?? 'Erro ao cancelar ingressos')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCancel} className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-foreground">Cancelar ingressos</h4>
          <span className="text-[10px] text-muted-foreground">Ingressos validados não são afetados</span>
        </div>

        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => { setMode('batch'); setPreview(null) }}
            className={`py-2 px-4 text-sm rounded-xl font-medium transition-all ${mode === 'batch' ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}>
            Cancelar lote
          </button>
          <button type="button" onClick={() => { setMode('individual'); setPreview(null) }}
            className={`py-2 px-4 text-sm rounded-xl font-medium transition-all ${mode === 'individual' ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}>
            Cancelar individuais
          </button>
        </div>

        {mode === 'batch' ? (
          <div className="space-y-3">
            <Select value={batchName} onValueChange={(v) => { setPreview(null); setBatchName(v) }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um lote…" />
              </SelectTrigger>
              <SelectContent>
                {batchOptions.map((b) => (
                  <SelectItem key={b.batch} value={b.batch}>
                    {b.batch} ({b.total} ingressos · {b.validated} validados)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {preview === 'loading' && (
              <div className="text-xs text-muted-foreground animate-pulse">Calculando…</div>
            )}
            {preview && preview !== 'loading' && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 text-sm">
                <p className="text-amber-700 dark:text-amber-300 font-medium">Preview: {preview.total} ingresso(s) serão cancelados</p>
                <p className="text-amber-600/70 dark:text-amber-400/70 text-xs mt-1">Os validados serão ignorados automaticamente.</p>
              </div>
            )}
          </div>
        ) : (
          <textarea className="input min-h-[100px]" placeholder="Códigos dos ingressos (um por linha)&#10;Ex:&#10;EVT2026-000001&#10;EVT2026-000002" value={ticketCodes} onChange={(e) => setTicketCodes(e.target.value)} required />
        )}

        <Button type="submit" disabled={loading || (mode === 'batch' && !batchName.trim())} className="w-full sm:w-auto">
          {loading ? 'Cancelando…' : (mode === 'batch' ? '🚫 Cancelar lote' : '🚫 Cancelar ingressos')}
        </Button>
      </form>

      {result && (
        <div className="card p-5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 text-lg">✓</span>
            <p className="text-sm text-foreground font-medium">{result.message}</p>
          </div>
          {result.cancelled?.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1 mt-3">
              {result.cancelled.map((t) => (
                <div key={t.ticket_code} className="flex justify-between text-xs text-muted-foreground bg-secondary/60 rounded-lg px-3 py-1.5">
                  <span>{t.ticket_code}</span>
                  <span className="text-red-600 dark:text-red-300">{t.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
