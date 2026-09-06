import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { marked } from 'marked'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Btn } from '../../components/ui'
import { getEvent } from '../../services/eventsService'
import { createInvitation } from '../../services/eventsActionsService'
import {
  getReportMarkdown, downloadReportCsv, downloadReportMarkdown, getAuditLog,
} from '../../services/reportsService'
import { formatDateTime } from '../../lib/format'

export default function ReportsPanel() {
  const { eventId } = useParams()
  const [event, setEvent] = useState(null)
  const [md, setMd] = useState('')
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [mdLoading, setMdLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Convite avulso
  const [inviteForm, setInviteForm] = useState({ display_name: '', cpf: '' })
  const [inviteTicket, setInviteTicket] = useState(null)
  const printRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, auditRows] = await Promise.all([
        getEvent(eventId),
        getAuditLog(eventId, 50),
      ])
      setEvent(ev)
      setAudit(auditRows || [])
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  async function loadMdPreview() {
    setMdLoading(true)
    setError('')
    try {
      const text = await getReportMarkdown(eventId)
      setMd(text)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao gerar preview.')
    } finally {
      setMdLoading(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await createInvitation(eventId, {
        display_name: inviteForm.display_name,
        cpf: inviteForm.cpf ? inviteForm.cpf.replace(/\D/g, '') : undefined,
      })
      setInviteTicket(res)
    } catch (err) {
      setError(err?.response?.data?.details || err?.response?.data?.error || 'Erro ao gerar convite.')
    } finally {
      setBusy(false)
    }
  }

  const mdHtml = useMemo(() => {
    if (!md) return ''
    const result = marked.parse(md)
    return typeof result === 'string' ? result : ''
  }, [md])

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)

  return (
    <div className="page">
      <TopBar crumb={`Supervisor · ${event?.name}`} eventName={event?.name} onBack={() => window.history.back()} />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section className="hero">
          <div>
            <Link to={`/supervisor/${eventId}`} className="btn-text">← Dashboard</Link>
            <p className="hero-eyebrow mt-2">Relatórios</p>
            <h1 className="hero-title">Relatórios do evento</h1>
            <p className="hero-sub">Exporte o relatório completo em Markdown ou CSV e gere convites avulsos.</p>
          </div>
          <div className="hero-actions flex-wrap">
            <Btn variant="primary" loading={mdLoading} onClick={loadMdPreview}>Carregar preview</Btn>
            <Btn variant="outline" loading={busy}
              onClick={async () => { setBusy(true); try { await downloadReportMarkdown(event) } finally { setBusy(false) } }}>
              Baixar Markdown
            </Btn>
            <Btn variant="outline" loading={busy}
              onClick={async () => { setBusy(true); try { await downloadReportCsv(event) } finally { setBusy(false) } }}>
              Baixar CSV
            </Btn>
          </div>
        </section>

        <div className="grid grid-cols-3 mb-4">
          <div className="card metric-card">
            <p className="metric-label">Validados</p>
            <p className="metric-value">{event?.validated_count ?? 0}</p>
          </div>
          <div className="card metric-card">
            <p className="metric-label">Ingressos</p>
            <p className="metric-value">{event?.tickets_count ?? 0}</p>
          </div>
          <div className="card metric-card">
            <p className="metric-label">Status</p>
            <p className="metric-value" style={{ fontSize: 18, marginTop: 10 }}>{event?.status}</p>
          </div>
        </div>

        <div className="grid" style={{ gap: 20 }}>
          {/* Preview */}
          <div className="card card-pad">
            <div className="card-head">
              <h3 className="card-title">Preview Markdown</h3>
              {md && <button type="button" className="btn-ghost btn-sm" onClick={() => setMd('')}>Limpar</button>}
            </div>
            {md ? (
              <div
                className="report-pre"
                dangerouslySetInnerHTML={{ __html: mdHtml }}
              />
            ) : (
              <p className="text-muted text-sm">
                Clique em “Carregar preview” para visualizar o relatório Markdown do evento.
              </p>
            )}
          </div>

          {/* Gerador de convite */}
          <div className="card card-pad">
            <div className="card-head"><h3 className="card-title">Gerador de convite avulso</h3></div>
            <form onSubmit={handleInvite} className="grid grid-cols-3" style={{ gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Nome *</label>
                <input className="input" value={inviteForm.display_name}
                  onChange={(e) => setInviteForm({ ...inviteForm, display_name: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">CPF (opcional)</label>
                <input className="input" inputMode="numeric" placeholder="000.000.000-00" value={inviteForm.cpf}
                  onChange={(e) => setInviteForm({ ...inviteForm, cpf: e.target.value })} />
              </div>
              <div className="flex items-end" style={{ paddingBottom: 14 }}>
                <Btn type="submit" variant="primary" block loading={busy} disabled={!inviteForm.display_name}>
                  Gerar convite
                </Btn>
              </div>
            </form>

            {inviteTicket && (
              <div className="mt-4" ref={printRef}>
                <div className="card card-pad" style={{ textAlign: 'center', border: '1px dashed var(--vv-purple-mid)' }}>
                  <p className="font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>{inviteTicket.display_name}</p>
                  <QRCodeSVG value={inviteTicket.qrcode_data} size={180} includeMargin level="M" style={{ margin: '0 auto' }} />
                  <p className="mono text-xs mt-3">{inviteTicket.ticket_code}</p>
                  <p className="text-xs text-muted mt-1">Origem: {inviteTicket.origin} · {inviteTicket.status}</p>
                </div>
                <div className="flex gap-2 mt-3 justify-center">
                  <Btn variant="outline" onClick={() => window.print()}>🖨 Imprimir</Btn>
                  <Btn variant="ghost" onClick={() => setInviteTicket(null)}>Fechar</Btn>
                </div>
              </div>
            )}
          </div>

          {/* Auditoria */}
          <div className="card card-pad">
            <div className="card-head">
              <h3 className="card-title">Log de auditoria</h3>
              <span className="badge badge-gray">{audit.length}</span>
            </div>
            {audit.length === 0 && <EmptyState title="Sem registros de auditoria" />}
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Quando</th><th>Ação</th><th>Usuário</th></tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={`${a.created_at}-${i}`}>
                      <td className="text-xs">{formatDateTime(a.created_at)}</td>
                      <td className="mono text-sm">{a.action}</td>
                      <td className="text-sm">{a.user_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
