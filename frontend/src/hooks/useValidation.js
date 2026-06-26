import { useCallback } from 'react'
import { db }           from '../services/localDB'
import { hashCPF }      from '../services/hashService'
import { useTerminalStore } from '../store/terminalStore'
import { useAuthStore }     from '../store/authStore'
import api from '../services/api'

const RESULT = {
  AUTHORIZED: 'authorized',
  DUPLICATE:  'duplicate',
  BLOCKED:    'blocked',
  NOT_FOUND:  'not_found',
  ERROR:      'error',
}

export function useValidation() {
  const { eventId, terminalId, eventSalt } = useTerminalStore()
  const { user } = useAuthStore()

  /**
   * Validação offline-first por CPF em claro (do QRCode)
   */
  const validateCPF = useCallback(async (cpfRaw) => {
    try {
      // ── Online path: delegar ao backend ──────────────────────
      if (navigator.onLine) {
        const { data } = await api.post('/api/validation/qrcode', {
          cpf_raw:     cpfRaw,
          event_id:    eventId,
          terminal_id: terminalId,
        })
        return data
      }

      // ── Offline path: consulta IndexedDB ─────────────────────
      if (!eventSalt) throw new Error('Salt do evento não disponível para modo offline.')
      const hash = await hashCPF(cpfRaw, eventSalt)

      const ticket = await db.tickets
        .where('hash_cpf').equals(hash)
        .and((t) => t.event_id === eventId)
        .first()

      if (!ticket) return { status: RESULT.NOT_FOUND }
      if (ticket.status === 'blocked')   return { status: RESULT.BLOCKED, ticket_code: ticket.ticket_code }
      if (ticket.status === 'validated') {
        return {
          status:       RESULT.DUPLICATE,
          ticket_code:  ticket.ticket_code,
          display_name: ticket.display_name,
        }
      }
      if (ticket.status === 'generated') {
        return { status: 'invalid_status', reason: 'Ingresso sem CPF vinculado.' }
      }

      // Autorizar localmente
      const now = new Date().toISOString()
      await db.tickets.update(ticket.id, { status: 'validated', validated_at: now })

      // Enfileirar log offline
      await db.entry_logs.add({
        id:          crypto.randomUUID(),
        ticket_id:   ticket.id,
        event_id:    eventId,
        hash_cpf:    hash,
        entry_type:  'qrcode',
        terminal_id: terminalId,
        validator_id: user?.id,
        is_duplicate: false,
        synced:      0,
        created_at:  now,
      })

      return {
        status:       RESULT.AUTHORIZED,
        ticket_code:  ticket.ticket_code,
        display_name: ticket.display_name,
        batch:        ticket.batch,
      }
    } catch (err) {
      console.error('Erro na validação:', err)
      return { status: RESULT.ERROR, reason: err.message }
    }
  }, [eventId, terminalId, eventSalt, user])

  /**
   * Confirmação de entrada manual (após busca)
   */
  const validateManual = useCallback(async (ticketId) => {
    try {
      if (navigator.onLine) {
        const { data } = await api.post('/api/validation/manual', {
          ticket_id:   ticketId,
          event_id:    eventId,
          terminal_id: terminalId,
        })
        return data
      }

      // Offline manual
      const ticket = await db.tickets.get(ticketId)
      if (!ticket) return { status: RESULT.NOT_FOUND }
      if (ticket.status === 'validated') {
        return { status: RESULT.DUPLICATE, ticket_code: ticket.ticket_code, display_name: ticket.display_name }
      }
      if (ticket.status === 'blocked') return { status: RESULT.BLOCKED }
      if (ticket.status === 'generated') return { status: 'invalid_status', reason: 'Sem CPF vinculado.' }

      const now = new Date().toISOString()
      await db.tickets.update(ticket.id, { status: 'validated', validated_at: now })
      await db.entry_logs.add({
        id:           crypto.randomUUID(),
        ticket_id:    ticket.id,
        event_id:     eventId,
        hash_cpf:     ticket.hash_cpf,
        entry_type:   'manual',
        terminal_id:  terminalId,
        validator_id: user?.id,
        is_duplicate: false,
        synced:       0,
        created_at:   now,
      })

      return {
        status:       RESULT.AUTHORIZED,
        ticket_code:  ticket.ticket_code,
        display_name: ticket.display_name,
        batch:        ticket.batch,
      }
    } catch (err) {
      return { status: RESULT.ERROR, reason: err.message }
    }
  }, [eventId, terminalId, user])

  return { validateCPF, validateManual }
}
