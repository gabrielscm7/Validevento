import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { saveMeta, setTerminalId, setEventId } from '../../services/localDB'
import { useTerminalStore } from '../../store/terminalStore'
import Logo from '../../components/Logo'

export default function JoinTerminal() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { setGeneric, setEvent, setTerminal } = useTerminalStore()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [loading, setLoading] = useState(true)
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    api.get(`/api/terminal/join/${slug}`)
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(
        e?.response?.data?.details || 'Link inválido ou evento encerrado.'
      ))
      .finally(() => setLoading(false))
  }, [slug])

  async function handleEnter() {
    setEntering(true)
    setError('')
    try {
      await api.post(`/api/terminal/join/${slug}/open`, {
        operator_name: operatorName.trim() || null,
      })

      // Salva o contexto local para o Terminal.jsx operar offline.
      await setTerminalId(data.terminal_id)
      await setEventId(data.event_id)
      await saveMeta('event_config', data.event_config)
      await saveMeta('terminal_name', data.terminal_name)
      await saveMeta('event_name', data.event_name)

      setGeneric({ slug })
      await setEvent({ eventId: data.event_id })
      await setTerminal({ terminalId: data.terminal_id, terminalName: data.terminal_name })

      navigate(`/terminal/join/${slug}/app`, { replace: true })
    } catch (e) {
      setError(
        e?.response?.data?.details || 'Não foi possível entrar no terminal.'
      )
    } finally {
      setEntering(false)
    }
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#0f172a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
        Carregando...
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: 32, maxWidth: 360, width: '100%',
        textAlign: 'center',
      }}>
        {data?.logo_url ? (
          <img
            src={data.logo_url} alt="Logo do evento"
            style={{ maxHeight: 48, objectFit: 'contain', marginBottom: 16 }}
          />
        ) : (
          <Logo size={32} light style={{ marginBottom: 16 }} />
        )}

        {error ? (
          <>
            <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              Verifique o link com o responsável pelo evento.
            </p>
          </>
        ) : (
          <>
            <h1 style={{
              color: '#c084fc', fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700, fontSize: 18, marginBottom: 4,
            }}>
              {data?.terminal_name}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 24 }}>
              {data?.event_name}
            </p>

            <div style={{ marginBottom: 20, textAlign: 'left' }}>
              <label style={{
                display: 'block', color: 'rgba(255,255,255,0.5)',
                fontSize: 12, marginBottom: 6,
              }}>
                Seu nome (opcional)
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Para registro de operador"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, padding: '10px 12px',
                  color: '#fff', fontSize: 14,
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
              />
            </div>

            <button
              type="button"
              onClick={handleEnter}
              disabled={entering}
              style={{
                width: '100%', background: '#4A2368',
                border: 'none', borderRadius: 10, padding: '12px 0',
                color: '#fff', fontSize: 15, fontWeight: 600,
                cursor: entering ? 'not-allowed' : 'pointer',
                opacity: entering ? 0.7 : 1,
              }}
            >
              {entering ? 'Entrando...' : 'Entrar como validador'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
