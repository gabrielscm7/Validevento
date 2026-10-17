import { useState } from 'react'
import { Modal, Btn } from './ui'
import { purgeEventData } from '../services/eventsService'

export default function PurgeEventModal({ eventId, eventName, onSuccess, onClose }) {
  const [mode, setMode] = useState('reset') // 'reset' | 'full'
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isReset = mode === 'reset'
  // Reset não exige confirmação por nome — apenas um clique.
  // Full purge exige digitar o nome do evento.
  const canConfirm = isReset || confirmation === eventName

  async function handleAction() {
    if (!canConfirm) return
    setLoading(true)
    setError('')
    try {
      await purgeEventData(eventId, mode)
      setConfirmation('')
      onSuccess?.()
    } catch (err) {
      setError(
        err?.response?.data?.details ||
        err?.response?.data?.error ||
        'Não foi possível executar a ação.'
      )
    } finally {
      setLoading(false)
    }
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: active ? '1px solid var(--vv-purple-mid)' : '1px solid var(--border)',
    background: active ? 'var(--vv-purple-light)' : 'transparent',
    color: active ? 'var(--text-strong)' : 'var(--text-muted)',
    fontWeight: 600,
    cursor: 'pointer',
  })

  return (
    <Modal
      open
      onClose={loading ? undefined : onClose}
      title={isReset ? 'Resetar dados do evento' : 'Excluir evento permanentemente'}
      footer={(
        <>
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Btn>
          <Btn
            variant="danger"
            loading={loading}
            onClick={handleAction}
            disabled={!canConfirm}
          >
            {isReset ? 'Resetar dados operacionais' : 'Excluir evento permanentemente'}
          </Btn>
        </>
      )}
    >
      {/* Seletor de modo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          style={tabStyle(isReset)}
          onClick={() => { setMode('reset'); setConfirmation('') }}
        >
          Resetar (recomendado)
        </button>
        <button
          type="button"
          style={tabStyle(!isReset)}
          onClick={() => { setMode('full'); setConfirmation('') }}
        >
          Apagar tudo
        </button>
      </div>

      {isReset ? (
        /* MODO RESET */
        <>
          <div style={{
            background: '#fffbeb',
            border: '1px solid #fbbf24',
            borderRadius: 8, padding: 16, marginBottom: 12,
          }}>
            <p style={{ fontSize: 22, margin: 0 }} aria-hidden="true">🔄</p>
            <p className="font-semibold" style={{ color: '#92400e' }}>
              Resetar mantém a estrutura do evento.
            </p>
            <p>
              Os ingressos, logs de entrada e registros de validação
              serão removidos. O evento voltará para rascunho pronto
              para reimportar ingressos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-sm">
            <div>
              <p className="label">Será apagado</p>
              <ul className="text-sm">
                <li>Todos os ingressos</li>
                <li>Logs de validação</li>
                <li>Registros de terminais</li>
                <li>Histórico de portões (timestamps)</li>
              </ul>
            </div>
            <div>
              <p className="label">Será mantido</p>
              <ul className="text-sm">
                <li>Configurações de validação</li>
                <li>Equipe designada</li>
                <li>Portões (estrutura)</li>
                <li>Nome, data e local</li>
              </ul>
            </div>
          </div>
          <p className="text-sm text-muted mt-3">
            Esta ação pode ser revertida reimportando os ingressos.
          </p>
        </>
      ) : (
        /* MODO FULL PURGE */
        <>
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8, padding: 16, marginBottom: 12,
          }}>
            <p style={{ fontSize: 22, margin: 0 }} aria-hidden="true">⚠️</p>
            <p className="font-semibold" style={{ color: '#991b1b' }}>
              Esta ação é irreversível.
            </p>
            <p>
              O evento <strong>{eventName}</strong> e todos os seus dados serão
              excluídos definitivamente — ele deixa de aparecer nas listas e não
              poderá mais ser acessado.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-sm">
            <div>
              <p className="label">Será excluído</p>
              <ul className="text-sm">
                <li>O próprio evento</li>
                <li>Ingressos e lotes</li>
                <li>Logs de validação</li>
                <li>Configurações</li>
                <li>Equipe designada</li>
                <li>Portões e terminais</li>
              </ul>
            </div>
            <div>
              <p className="label">Será mantido</p>
              <ul className="text-sm">
                <li>Log de auditoria desta exclusão</li>
              </ul>
            </div>
          </div>
          <div className="field mt-3">
            <label htmlFor="purge-confirmation" className="label">
              Para confirmar, digite o nome do evento:
            </label>
            <input
              id="purge-confirmation"
              className="input"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              placeholder={eventName}
            />
          </div>
        </>
      )}

      {error && <div className="form-error mt-2" role="alert">{error}</div>}
    </Modal>
  )
}
