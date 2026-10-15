import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEventList } from '../../hooks/useEventList'
import { switchEventPath } from '../../lib/nav'
import { formatDate } from '../../lib/format'
import { NavIcon } from './icons'

const STATUS = {
  active: { dot: 'dot-green pulse' },
  draft: { dot: 'dot-gray' },
  closed: { dot: 'dot-red' },
}

export function EventSwitcher({ eventId, eventName }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const role = user?.role
  const canList = role === 'admin' || role === 'supervisor' || role === 'master'
  const events = useEventList(canList)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!canList || !eventId) return null

  const list = events || []
  if (!list.length) return null

  const current = list.find((e) => e.id === eventId)
  const status = current ? STATUS[current.status] : null
  const filtered = query
    ? list.filter((e) => (e.name || '').toLowerCase().includes(query.toLowerCase()))
    : list

  function pick(id) {
    setOpen(false)
    setQuery('')
    if (id !== eventId) navigate(switchEventPath(location.pathname, id, role))
  }

  return (
    <div className="event-switch" ref={ref}>
      <button
        type="button"
        className="event-switch-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Trocar de evento"
      >
        <span className={`dot ${status?.dot || 'dot-gray'}`} />
        <span className="event-switch-name">{eventName || current?.name || 'Selecionar evento'}</span>
        <span className={`event-switch-caret ${open ? 'open' : ''}`}>
          <NavIcon name="chevron" size={15} />
        </span>
      </button>

      {open && (
        <div className="event-menu" role="listbox" aria-label="Eventos disponíveis">
          <div className="event-menu-search">
            <input
              className="input"
              placeholder="Buscar evento…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="event-menu-list">
            {filtered.length === 0 && <p className="event-menu-empty">Nenhum evento encontrado</p>}
            {filtered.map((ev) => (
              <button
                key={ev.id}
                type="button"
                role="option"
                aria-selected={ev.id === eventId}
                className={`event-menu-item ${ev.id === eventId ? 'active' : ''}`}
                onClick={() => pick(ev.id)}
              >
                <span className={`dot ${STATUS[ev.status]?.dot || 'dot-gray'}`} />
                <span className="event-menu-text">
                  <span className="event-menu-name truncate">{ev.name}</span>
                  <span className="event-menu-sub">{formatDate(ev.date)}</span>
                </span>
                {ev.id === eventId && <span className="event-menu-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default EventSwitcher
