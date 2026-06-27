import { useCallback, useEffect, useRef } from 'react'
import { db }           from '../services/localDB'
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

const PENDING_VERIFICATION_KEY = 've_pending_verification'

function loadPendingVerification() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_VERIFICATION_KEY) || '[]')
  } catch { return [] }
}

function savePendingVerification(queue) {
  localStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(queue))
}

export function useValidation() {
  const { eventId, terminalId } = useTerminalStore()
  const { user } = useAuthStore()

  const lookupTicketCode = useCallback(async (ticketCode) => {
    const code = ticketCode.trim().toLowerCase()
    try {
      if (navigator.onLine) {
        const { data } = await api.get('/api/validation/lookup', {
          params: { code, event_id: eventId }
        })
        return data
      }

      const ticket = await db.tickets
        .where('ticket_code').equals(code)
        .and((t) => t.event_id === eventId)
        .first()

      if (!ticket) return { status: RESULT.NOT_FOUND }
      return {
        status: ticket.status,
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        batch: ticket.batch,
        first_entry_at: ticket.validated_at
      }
    } catch (err) {
      console.error('Erro na consulta:', err)
      return { status: RESULT.ERROR, reason: err.message }
    }
  }, [eventId])

  const processPendingVerifications = useCallback(async () => {
    if (!navigator.onLine) return
    const pending = loadPendingVerification()
    if (pending.length === 0) return

    const now = Date.now()
    const fresh = pending.filter(p => now - new Date(p.timestamp).getTime() < 3600000)
    savePendingVerification([])

    for (const item of fresh) {
      try {
        const { data } = await api.post('/api/validation/qrcode', {
          ticket_code: item.ticket_code,
          event_id:    eventId,
          terminal_id: terminalId,
        })
        if (data.status === 'authorized' || data.status === 'duplicate' || data.status === 'blocked') {
          console.log(`Ticket ${item.ticket_code} confirmado no servidor (estava ausente localmente).`)
        }
      } catch { /* silent */ }
    }
  }, [eventId, terminalId])

  const pendingVerificationRef = useRef(false)

  useEffect(() => {
    const handleOnline = () => {
      if (!pendingVerificationRef.current) {
        pendingVerificationRef.current = true
        processPendingVerifications().finally(() => {
          pendingVerificationRef.current = false
        })
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [processPendingVerifications])

  const validateTicketCode = useCallback(async (ticketCode) => {
    const code = ticketCode.trim().toLowerCase()
    try {
      if (navigator.onLine) {
        const { data } = await api.post('/api/validation/qrcode', {
          ticket_code: code,
          event_id:    eventId,
          terminal_id: terminalId,
        })
        return data
      }

      const ticket = await db.tickets
        .where('ticket_code').equals(code)
        .and((t) => t.event_id === eventId)
        .first()

      if (!ticket) {
        const pending = loadPendingVerification()
        pending.push({ ticket_code: code, timestamp: new Date().toISOString(), event_id: eventId })
        savePendingVerification(pending.slice(-50))
        return { status: RESULT.NOT_FOUND }
      }
      if (ticket.status === 'blocked')   return { status: RESULT.BLOCKED, ticket_code: ticket.ticket_code }
      if (ticket.status === 'validated') {
        return {
          status:       RESULT.DUPLICATE,
          ticket_code:  ticket.ticket_code,
          display_name: ticket.display_name,
        }
      }

      const now = new Date().toISOString()
      await db.tickets.update(ticket.id, { status: 'validated', validated_at: now })

      await db.entry_logs.add({
        id:           crypto.randomUUID(),
        ticket_id:    ticket.id,
        event_id:     eventId,
        entry_type:   'qrcode',
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
      console.error('Erro na validação:', err)
      return { status: RESULT.ERROR, reason: err.message }
    }
  }, [eventId, terminalId, user])

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

      const ticket = await db.tickets.get(ticketId)
      if (!ticket) return { status: RESULT.NOT_FOUND }
      if (ticket.status === 'validated') {
        return { status: RESULT.DUPLICATE, ticket_code: ticket.ticket_code, display_name: ticket.display_name }
      }
      if (ticket.status === 'blocked') return { status: RESULT.BLOCKED }

      const now = new Date().toISOString()
      await db.tickets.update(ticket.id, { status: 'validated', validated_at: now })
      await db.entry_logs.add({
        id:           crypto.randomUUID(),
        ticket_id:    ticket.id,
        event_id:     eventId,
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

  return { lookupTicketCode, validateTicketCode, validateManual }
}
