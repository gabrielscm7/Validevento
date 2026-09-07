import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import Logo from '../components/Logo'
import { isValidUUIDv4 } from '../lib/uuid'

// Extrai o UUID de um link do tipo https://…/terminal/<uuid> ou de um texto colado.
function extractEventId(input) {
  const raw = (input || '').trim()
  if (isValidUUIDv4(raw)) return raw
  const m = raw.match(/\/(terminal|supervisor)\/([0-9a-f-]{36})/i)
  if (m && isValidUUIDv4(m[2])) return m[2]
  return null
}

export default function NoEventScreen() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')

  function go() {
    const eventId = extractEventId(value)
    if (!eventId) {
      setErr('Link ou código do evento inválido. Cole o link completo enviado pela equipe.')
      return
    }
    const role = user?.role
    navigate(role === 'validator' ? `/terminal/${eventId}` : `/supervisor/${eventId}`)
  }

  return (
    <div className="page">
      <div className="page-body narrow">
        <div className="empty" style={{ paddingTop: 60 }}>
          <Logo withText />
          <div style={{ marginTop: 32 }}>
            <p className="empty-title">Nenhum evento em acesso</p>
            <p className="empty-sub">
              {user?.role === 'validator'
                ? 'Use o link do evento enviado pela equipe para abrir a portaria.'
                : 'Você ainda não foi vinculado a nenhum evento. Fale com o administrador.'}
            </p>
          </div>

          {user?.role === 'validator' && (
            <div className="card card-pad" style={{ maxWidth: 420, margin: '24px auto 0' }}>
              <label className="label" htmlFor="event-link">Cole aqui o link do evento</label>
              <input
                id="event-link"
                className="input"
                placeholder="https://www.validevento.com.br/terminal/…"
                value={value}
                onChange={(e) => { setValue(e.target.value); setErr('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') go() }}
              />
              {err && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{err}</p>}
              <button type="button" className="btn btn-primary btn-lg mt-3" style={{ width: '100%' }} onClick={go} disabled={!value.trim()}>
                Abrir portaria
              </button>
              <p className="text-xs text-muted mt-3">
                O link vem no e-mail de convite do evento ou do administrador da equipe.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
