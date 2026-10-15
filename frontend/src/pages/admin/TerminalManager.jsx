import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { Modal, Btn } from '../../components/ui'
import { TerminalQRModal } from '../../components/admin/TerminalQRModal'
import { listTerminals, suspendTerminal, deleteTerminal } from '../../services/eventsService'
import { toast } from 'sonner'
import { relativeTime } from '../../lib/format'

export default function TerminalManager() {
  const { id: eventId } = useParams()
  const [terminals, setTerminals] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTerminal, setSelectedTerminal] = useState(null)
  const [showQR, setShowQR] = useState(false)
  const [suspendTarget, setSuspendTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  const loadTerminals = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listTerminals(eventId)
      setTerminals((data || []).filter((t) => t.is_generic))
    } catch {
      toast.error('Erro ao carregar terminais')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { loadTerminals() }, [loadTerminals])

  async function handleCopyLink(slug) {
    const url = `${window.location.origin}/terminal/join/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado!')
    } catch {
      toast.error('Não foi possível copiar o link.')
    }
  }

  async function handleSuspend(terminal) {
    setActionLoading(true)
    try {
      await suspendTerminal(eventId, terminal.id, !terminal.suspended)
      toast.success(terminal.suspended ? 'Terminal reativado' : 'Terminal suspenso')
      setSuspendTarget(null)
      loadTerminals()
    } catch {
      toast.error('Erro ao atualizar terminal')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete(terminal) {
    setActionLoading(true)
    try {
      await deleteTerminal(eventId, terminal.id)
      toast.success('Terminal removido')
      setDeleteTarget(null)
      loadTerminals()
    } catch {
      toast.error('Erro ao remover terminal')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="page">
      <TopBar crumb="Admin · Terminais" eventName={terminals[0]?.event_name} />
      <div className="page-body">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
          <h1 className="hero-title" style={{ fontSize: 22 }}>Terminais Genéricos</h1>
          <Link to={`/admin/eventos/${eventId}`} className="btn btn-outline btn-sm">
            ← Voltar ao evento
          </Link>
        </div>

        <div className="card card-pad">
          {loading ? (
            <div className="p-8 text-center text-muted">Carregando...</div>
          ) : terminals.length === 0 ? (
            <div className="p-8 text-center text-muted">
              Nenhum terminal genérico criado para este evento.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Validações hoje</th>
                    <th>Último acesso</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.map((t) => (
                    <tr key={t.id} className={t.suspended ? 'opacity-50' : ''}>
                      <td className="font-medium">{t.name}</td>
                      <td className="mono text-sm">{t.slug}</td>
                      <td>
                        <span className={`badge ${
                          t.suspended ? 'badge-red' : t.online ? 'badge-green' : 'badge-gray'
                        }`}>
                          {t.suspended ? 'Suspenso' : t.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>{t.validations_today ?? 0}</td>
                      <td className="text-sm text-muted">
                        {t.last_seen_at ? relativeTime(t.last_seen_at) : '—'}
                      </td>
                      <td>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => { setSelectedTerminal(t); setShowQR(true) }}
                          >
                            QR
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => handleCopyLink(t.slug)}
                          >
                            Copiar
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${t.suspended ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setSuspendTarget(t)}
                          >
                            {t.suspended ? 'Reativar' : 'Suspender'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setDeleteTarget(t)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showQR && selectedTerminal && (
        <TerminalQRModal
          terminal={selectedTerminal}
          onClose={() => { setShowQR(false); setSelectedTerminal(null) }}
        />
      )}

      {suspendTarget && (
        <Modal
          open
          onClose={() => setSuspendTarget(null)}
          title={suspendTarget.suspended ? 'Reativar Terminal' : 'Suspender Terminal'}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setSuspendTarget(null)}>Cancelar</Btn>
              <Btn
                variant={suspendTarget.suspended ? 'primary' : 'danger'}
                loading={actionLoading}
                onClick={() => handleSuspend(suspendTarget)}
              >
                Confirmar
              </Btn>
            </>
          }
        >
          <p className="text-sm">
            {suspendTarget.suspended
              ? `Deseja reativar o terminal "${suspendTarget.name}"? Ele voltará a aceitar conexões.`
              : `Deseja suspender o terminal "${suspendTarget.name}"? Ele não poderá mais ser usado.`}
          </p>
          <p className="text-sm text-muted mt-2">
            Os dados gerados por este terminal serão preservados.
          </p>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title="Excluir Terminal"
          footer={
            <>
              <Btn variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={() => handleDelete(deleteTarget)}>
                Excluir
              </Btn>
            </>
          }
        >
          <p className="text-sm">
            Deseja excluir o terminal "{deleteTarget.name}"?
          </p>
          <p className="text-sm text-muted mt-2">
            Esta ação é reversível. Os dados de validação serão mantidos.
          </p>
        </Modal>
      )}
    </div>
  )
}
