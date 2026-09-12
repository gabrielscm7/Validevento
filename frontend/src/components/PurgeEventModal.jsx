import { useState } from 'react'
import { Modal, Btn } from './ui'
import { purgeEventData } from '../services/eventsService'

export default function PurgeEventModal({ eventId, eventName, onSuccess, onClose }) {
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handlePurge() {
    if (confirmation !== eventName) return
    setLoading(true)
    setError('')
    try {
      await purgeEventData(eventId)
      setConfirmation('')
      onSuccess?.()
    } catch (err) {
      setError(err?.response?.data?.details || err?.response?.data?.error || 'Não foi possível apagar os dados.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={loading ? undefined : onClose} title="Apagar dados do evento"
      footer={(
        <>
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Btn>
          <Btn
            variant="danger"
            loading={loading}
            onClick={handlePurge}
            disabled={confirmation !== eventName}
          >
            Apagar dados permanentemente
          </Btn>
        </>
      )}>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 16 }}>
        <p style={{ fontSize: 28, margin: 0 }} aria-hidden="true">⚠️</p>
        <p className="font-semibold" style={{ color: '#991b1b' }}>Esta ação é irreversível.</p>
        <p>
          Todos os ingressos, logs de entrada, configurações e registros de portão do evento
          {' '}<strong>{eventName}</strong> serão permanentemente removidos. O evento em si será
          mantido para histórico.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-sm mt-3">
        <div>
          <p className="label">Será apagado</p>
          <ul className="text-sm">
            <li>Todos os ingressos e lotes</li>
            <li>Logs de validação e entrada</li>
            <li>Configurações do evento</li>
            <li>Portões e terminais</li>
            <li>Equipe designada</li>
          </ul>
        </div>
        <div>
          <p className="label">Será mantido</p>
          <ul className="text-sm">
            <li>Nome, data e local</li>
            <li>Log desta exclusão</li>
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
        />
      </div>
      {error && <div className="form-error mt-2" role="alert">{error}</div>}
    </Modal>
  )
}
