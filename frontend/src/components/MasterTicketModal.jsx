import { useState } from 'react'
import api from '../services/api'
import { useTerminalStore } from '../store/terminalStore'
import { useAuthStore } from '../store/authStore'
import { Modal, Btn } from './ui'
import { playSound } from '../lib/sound'

/**
 * Modal de ingresso master — libera uma pessoa digitando o nome do beneficiado.
 */
export function MasterTicketModal({ open, onClose, onResult, usesCount, maxUses }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const eventId = useTerminalStore((s) => s.eventId)
  const terminalId = useTerminalStore((s) => s.terminalId)
  const user = useAuthStore((s) => s.user)

  const remaining = maxUses == null ? null : Math.max(0, (maxUses || 0) - (usesCount || 0))
  const limitReached = maxUses != null && remaining === 0

  async function handleUse() {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/api/validation/master', {
        event_id: eventId,
        terminal_id: terminalId,
        beneficiary_name: name.trim(),
        validator_id: user?.id,
      })
      playSound('authorized')
      setName('')
      onResult?.({ status: 'authorized', display_name: name.trim(), entry_type: 'master', ...data })
      onClose?.()
    } catch (err) {
      const d = err?.response?.data
      if (d?.error === 'master_ticket_limit_reached' || d?.details?.includes?.('Limite')) {
        setError('Limite de usos do ingresso master atingido.')
      } else {
        setError(d?.details || d?.error || 'Erro ao liberar entrada via ingresso master.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ingresso master"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" loading={loading} onClick={handleUse} disabled={!name.trim() || limitReached}>
            Liberar entrada
          </Btn>
        </>
      }>
      <div className="field">
        <label className="label">Nome do beneficiado *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Digite o nome da pessoa" autoFocus />
      </div>
      <p className="hint">
        {maxUses == null
          ? `${usesCount || 0} usos realizados · sem limite`
          : `${usesCount || 0} usos de ${maxUses} · ${remaining} restantes`}
      </p>
      {limitReached && <p className="field-error mt-2">Limite de usos atingido. Não é possível liberar.</p>}
      {error && <div className="form-error mt-2">{error}</div>}
    </Modal>
  )
}

export default MasterTicketModal
