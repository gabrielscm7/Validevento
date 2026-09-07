import { useState } from 'react'
import { shareEventWithTeam } from '../services/eventsActionsService'
import { Btn } from './ui'

/**
 * Card "Acesso da equipe": mostra o link do evento (terminal e dashboard),
 * permite copiar e enviar por e-mail para a equipe designada.
 */
export default function EventShareCard({ event, canShare = true }) {
  const [copied, setCopied] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const base = `${window.location.origin}`
  const links = [
    { key: 'terminal', label: 'Terminal de validação (portaria)', url: `${base}/terminal/${event.id}` },
    { key: 'dashboard', label: 'Dashboard do evento', url: `${base}/supervisor/${event.id}` },
    { key: 'admin', label: 'Página do evento (admin)', url: `${base}/admin/eventos/${event.id}` },
  ]

  async function copy(key) {
    const link = links.find((l) => l.key === key)
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(key)
      setErr('')
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setErr('Não foi possível copiar. Selecione o link manualmente.')
    }
  }

  async function handleShare() {
    setSending(true)
    setMsg('')
    setErr('')
    try {
      const res = await shareEventWithTeam(event.id)
      setMsg(`Link enviado para ${res.sent.length} pessoa(s) da equipe.`)
      if (res.failed && res.failed.length > 0) {
        setErr(`Falha no envio para: ${res.failed.map((f) => f.email).join(', ')}.`)
      }
    } catch (e) {
      setErr(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao enviar o link por e-mail.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Acesso da equipe</h3>
        <p className="card-sub">Compartilhe o link do evento com supervisores e validadores.</p>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {links.map((l) => (
          <div key={l.key} className="entity-row" style={{ flexWrap: 'wrap' }}>
            <div className="flex-1" style={{ minWidth: 0 }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>{l.label}</p>
              <p className="text-xs text-muted mono truncate">{l.url}</p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(l.key)}>
              {copied === l.key ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        ))}
      </div>

      {msg && <p className="form-success mt-3">{msg}</p>}
      {err && <p className="form-error mt-3">{err}</p>}

      {canShare && (
        <div className="mt-3">
          <Btn variant="primary" loading={sending} onClick={handleShare}>
            Enviar link por e-mail à equipe
          </Btn>
          <p className="hint mt-2">Cada membro recebe o link da página conforme o perfil (terminal, dashboard ou admin).</p>
        </div>
      )}
    </div>
  )
}
