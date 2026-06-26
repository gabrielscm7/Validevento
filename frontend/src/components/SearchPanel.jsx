import { useState, useCallback, useRef }  from 'react'
import api  from '../services/api'
import { db } from '../services/localDB'
import { hashCPF, normalizeCPF } from '../services/hashService'
import { useTerminalStore } from '../store/terminalStore'
import { useAuthStore } from '../store/authStore'
import { useValidation }    from '../hooks/useValidation'

const STATUS_LABEL = {
  linked:    { label: 'Disponível',  cls: 'badge-green'  },
  validated: { label: 'Já entrou',   cls: 'badge-yellow' },
  generated: { label: 'Sem CPF',     cls: 'badge-slate'  },
  blocked:   { label: 'Bloqueado',   cls: 'badge-red'    },
}

export function SearchPanel({ onResult }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const debounceRef = useRef(null)
  const { eventId, eventSalt } = useTerminalStore()
  const token                  = useAuthStore((s) => s.token)
  const { validateManual }     = useValidation()

  const search = useCallback(async (q) => {
    const trimmed = q.trim()
    if (!trimmed || !eventId) { setResults([]); return }

    setLoading(true)
    try {
      if (navigator.onLine) {
        if (!token) { setResults([]); setLoading(false); return }
        const isCPF = /^[\d.-]+$/.test(trimmed)
        const params = { event_id: eventId }
        if (isCPF) params.cpf = normalizeCPF(trimmed)
        else        params.q  = trimmed

        const { data } = await api.get('/api/validation/search', { params })
        setResults(data.results ?? [])
      } else {
        const isCPF = /^[\d.-]+$/.test(trimmed)
        if (isCPF) {
          if (!eventSalt) { setResults([]); return }
          const hash = await hashCPF(trimmed, eventSalt)
          const t = await db.tickets
            .where('hash_cpf').equals(hash)
            .and((r) => r.event_id === eventId).first()
          setResults(t ? [{ ticket_id: t.id, ticket_code: t.ticket_code, display_name: t.display_name, batch: t.batch, status: t.status }] : [])
        } else {
          if (trimmed.length < 3) { setResults([]); return }
          const all = await db.tickets
            .where('event_id').equals(eventId)
            .filter((t) => t.display_name?.toLowerCase().includes(trimmed.toLowerCase()))
            .limit(10).toArray()
          setResults(all.map((t) => ({ ticket_id: t.id, ticket_code: t.ticket_code, display_name: t.display_name, batch: t.batch, status: t.status })))
        }
      }
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [eventId, eventSalt, token])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 350)
  }

  const handleConfirm = async (ticketId) => {
    setConfirming(ticketId)
    const result = await validateManual(ticketId)
    setConfirming(null)
    setQuery('')
    setResults([])
    onResult?.(result)
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <input
        id="search-input"
        className="input"
        type="search"
        placeholder="Buscar por nome ou CPF…"
        value={query}
        onChange={handleChange}
        autoComplete="off"
      />

      {loading && (
        <p className="text-muted-foreground text-sm text-center">Buscando…</p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((r) => {
            const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'badge-slate' }
            return (
              <li key={r.ticket_id}
                  className="card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{r.display_name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{r.ticket_code} · {r.batch}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={st.cls}>{st.label}</span>
                  {r.status === 'linked' && (
                    <button
                      id={`confirm-btn-${r.ticket_id}`}
                      className="btn-primary py-1.5 px-3 text-xs"
                      disabled={confirming === r.ticket_id}
                      onClick={() => handleConfirm(r.ticket_id)}
                    >
                      {confirming === r.ticket_id ? '…' : 'Confirmar entrada'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!loading && query.length >= 1 && results.length === 0 && (
        <p className="text-muted-foreground text-sm text-center">Nenhum resultado encontrado</p>
      )}
    </div>
  )
}
