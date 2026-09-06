import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useTerminalStore } from '../store/terminalStore'
import { db } from '../services/localDB'
import { formatCPF } from '../lib/format'

/**
 * Painel de busca manual (drawer que sobe do rodapé).
 * Busca por nome ou CPF/código — debounce 300ms.
 * - Local (IndexedDB) quando offline; servidor (search) quando online.
 */
export function SearchPanel({ open, onClose, onConfirm }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef(null)
  const eventId = useTerminalStore((s) => s.eventId)

  useEffect(() => {
    if (!open) { setTerm(''); setResults([]); setError('') }
  }, [open])

  const searchLocal = useCallback(async (q) => {
    try {
      const rows = await db.tickets
        .filter((t) =>
          t.event_id === eventId &&
          (String(t.display_name || '').toLowerCase().includes(q) ||
            String(t.ticket_code || '').toLowerCase().includes(q))
        )
        .limit(10)
        .toArray()
      return rows.map((t) => ({
        ticket_id: t.id,
        ticket_code: t.ticket_code,
        display_name: t.display_name,
        batch: t.batch,
        status: t.status,
      }))
    } catch {
      return []
    }
  }, [eventId])

  useEffect(() => {
    if (!open) return
    const q = term.trim()
    if (q.length < 3) { setResults([]); setError(''); return }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError('')
      const online = typeof navigator === 'undefined' || navigator.onLine
      try {
        if (online) {
          const { data } = await api.get('/api/validation/search', {
            params: { event_id: eventId, q },
          })
          setResults(data.results || [])
        } else {
          setResults(await searchLocal(q.toLowerCase()))
        }
      } catch (err) {
        const msg = err?.response?.data?.error || ''
        if (msg.includes('mínimo')) {
          setError('Digite pelo menos 3 caracteres.')
        } else {
          setError(err?.response?.data?.error || 'Erro na busca.')
        }
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [term, open, eventId, searchLocal])

  const isCpfLike = () => /^\d[\d.]+$/.test(term.trim())

  return (
    <>
      {open && <div className="backdrop" style={{ background: 'rgba(8,10,20,.5)', zIndex: 145, alignItems: 'flex-end', padding: 0 }} onClick={onClose} />}
      <div className={`drawer ${open ? 'open' : ''}`} role="dialog" aria-label="Busca manual">
        <div className="drawer-handle" />
        <div className="drawer-head">
          <h3 className="font-semibold" style={{ color: '#fff' }}>Busca manual</h3>
          <button type="button" className="btn-ghost" style={{ color: 'rgba(255,255,255,.6)' }} onClick={onClose}>Fechar ✕</button>
        </div>
        <div className="drawer-body">
          <input
            className="input"
            autoFocus={open}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={isCpfLike() ? 'Buscar por CPF…' : 'Digite nome ou código (mín. 3 letras)…'}
            inputMode={isCpfLike() ? 'numeric' : 'text'}
          />
          <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,.4)' }}>
            {isCpfLike() ? `CPF formatado: ${formatCPF(term)}` : 'Busca por nome ou código do ingresso'}
          </p>

          {loading && <p className="text-center py-4 text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>Buscando…</p>}
          {error && <p className="text-sm py-2" style={{ color: '#fca5a5' }}>{error}</p>}

          {!loading && results.length === 0 && term.trim().length >= 3 && (
            <p className="text-center py-4 text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>Nenhum resultado encontrado</p>
          )}

          <div className="mt-3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r) => (
              <div key={r.ticket_id} className="row row-drawer">
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <p className="font-medium truncate" style={{ color: '#fff' }}>{r.display_name || 'Sem nome'}</p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,.5)' }}>
                    {r.batch || ''}
                    {r.status === 'validated' ? ' · já validado' : ''}
                    {r.status === 'blocked' ? ' · bloqueado' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="t-btn"
                  style={{ flex: 'none', width: 150, height: 38 }}
                  disabled={r.status === 'blocked'}
                  onClick={() => onConfirm(r)}
                >
                  Confirmar entrada
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export default SearchPanel
