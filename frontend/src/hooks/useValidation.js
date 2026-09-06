import { useCallback } from 'react'
import { db, getTicketByCode, saveEntryLog, getMeta } from '../services/localDB'
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

const DEFAULT_CONFIG = {
  qrcode_field: 'ticket_code',
  manual_fields: ['display_name'],
  checkout_enabled: false,
  reentry_mode: 'none',
  duplicate_action: 'warn',
  master_ticket_enabled: false,
}

function baseTicket(ticket) {
  return {
    ticket_code: ticket.ticket_code,
    display_name: ticket.display_name,
    batch: ticket.batch,
    origin: ticket.origin,
    first_entry_at: ticket.validated_at || null,
  }
}

/**
 * Hook offline-first de validação.
 * A validação acontece localmente (IndexedDB) com base na event_config salva
 * em meta('event_config'); o servidor é atualizado em background quando on-line.
 */
export function useValidation() {
  const eventId = useTerminalStore((s) => s.eventId)
  const terminalId = useTerminalStore((s) => s.terminalId)
  const user = useAuthStore((s) => s.user)

  const nowIso = () => new Date().toISOString()

  const configOf = async () => (await getMeta('event_config')) || { ...DEFAULT_CONFIG }

  /** Confirma no servidor em background (não bloqueia a resposta ao usuário). */
  const confirmOnServer = useCallback((ticketCode) => {
    if (!ticketCode || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    api.post('/api/validation/qrcode', {
      ticket_code: ticketCode,
      event_id: eventId,
      terminal_id: terminalId,
    }).catch(() => {})
  }, [eventId, terminalId])

  /** Aplica a máquina de estados local para um ticket encontrado no IndexedDB. */
  const applyLocalValidation = useCallback(async (ticket, entryType, config) => {
    const code = ticket.ticket_code
    const now = nowIso()

    if (ticket.status === 'blocked') {
      return { status: RESULT.BLOCKED, ticket_code: code }
    }

    if (ticket.status === 'active') {
      await db.tickets.update(ticket.id, {
        status: 'validated', validated_at: now, updated_at: now,
      })
      await saveEntryLog({
        ticket_id: ticket.id,
        ticket_code: code,
        event_id: eventId,
        entry_type: entryType,
        terminal_id: terminalId,
        validator_id: user?.id,
        is_duplicate: false,
        synced: 0,
        created_at: now,
      })
      confirmOnServer(code)
      return { status: RESULT.AUTHORIZED, ticket_code: code, display_name: ticket.display_name, batch: ticket.batch }
    }

    // status = 'validated' — aplica reentry_mode
    const mode = (config && config.reentry_mode) || 'none'

    if (mode === 'none') {
      return { status: RESULT.DUPLICATE, ...baseTicket(ticket) }
    }

    if (mode === 'free') {
      await saveEntryLog({
        ticket_id: ticket.id,
        ticket_code: code,
        event_id: eventId,
        entry_type: entryType,
        terminal_id: terminalId,
        validator_id: user?.id,
        is_duplicate: false,
        synced: 0,
        created_at: now,
      })
      confirmOnServer(code)
      return { status: RESULT.AUTHORIZED, reentry: true, ticket_code: code, display_name: ticket.display_name, batch: ticket.batch }
    }

    // mode = 'conditioned'
    if (!ticket.checkout_at) {
      return { status: RESULT.DUPLICATE, ...baseTicket(ticket) }
    }

    await db.tickets.update(ticket.id, { checkout_at: null, updated_at: now })
    await saveEntryLog({
      ticket_id: ticket.id,
      ticket_code: code,
      event_id: eventId,
      entry_type: entryType,
      terminal_id: terminalId,
      validator_id: user?.id,
      is_duplicate: false,
      synced: 0,
      created_at: now,
    })
    confirmOnServer(code)
    return { status: RESULT.AUTHORIZED, reentry: true, ticket_code: code, display_name: ticket.display_name, batch: ticket.batch }
  }, [eventId, terminalId, user, confirmOnServer])

  /** Persiste (ou atualiza) um ticket vindo do servidor quando não estava local. */
  const upsertRemoteTicket = useCallback(async (result, found) => {
    if (!result || result.status === RESULT.NOT_FOUND) return
    const code = result.ticket_code || found?.ticket_code
    if (!code) return

    const statusMap = {
      authorized: 'validated',
      duplicate: 'validated',
      blocked: 'blocked',
    }
    const status = statusMap[result.status] || found?.status || 'active'
    const payload = {
      ticket_code: code,
      display_name: result.display_name ?? found?.display_name,
      batch: result.batch ?? found?.batch,
      origin: found?.origin || 'import',
      status,
      event_id: eventId,
      updated_at: nowIso(),
      validated_at: result.first_entry_at || found?.validated_at || null,
    }

    const existing = await getTicketByCode(code)
    if (existing) await db.tickets.update(existing.id, payload)
    else await db.tickets.put({ ...payload })
  }, [eventId])

  /**
   * validateTicket(ticketCode) — fluxo offline-first:
   * 1. Busca no IndexedDB local
   * 2. Aplica reentry_mode/blocked/active localmente
   * 3. Se não encontrar localmente e estiver on-line, busca no servidor
   */
  const validateTicket = useCallback(async (ticketCode) => {
    const code = String(ticketCode || '').trim()
    if (!code) return { status: RESULT.NOT_FOUND }

    const config = await configOf()
    const ticket = await getTicketByCode(code)
    if (ticket) {
      return applyLocalValidation(ticket, 'qrcode', config)
    }

    // Não encontrado localmente
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { status: RESULT.NOT_FOUND }
    }

    try {
      const { data } = await api.get('/api/validation/search', {
        params: { event_id: eventId, q: code },
      })
      const found = (data.results || []).find(
        (r) => String(r.ticket_code).toLowerCase() === code.toLowerCase()
      )
      if (!found) return { status: RESULT.NOT_FOUND }

      // Encontrado no servidor → processa normalmente (validação remota)
      const serverRes = await api.post('/api/validation/qrcode', {
        ticket_code: code,
        event_id: eventId,
        terminal_id: terminalId,
      })
      await upsertRemoteTicket(serverRes.data, found)
      return serverRes.data
    } catch (err) {
      console.error('Erro na validação remota:', err)
      return { status: RESULT.ERROR, reason: err?.response?.data?.error || err?.message || 'Erro na validação.' }
    }
  }, [eventId, terminalId, applyLocalValidation, upsertRemoteTicket])

  /** Alias legado (Terminal) — mesmo fluxo offline-first. */
  const validateTicketCode = validateTicket

  /** Validação manual por id (busca manual). */
  const validateManual = useCallback(async (ticketId) => {
    const config = await configOf()
    const online = typeof navigator === 'undefined' || navigator.onLine

    // Id local (IndexedDB) — aplica fluxo offline-first
    const ticket = await db.tickets.get(ticketId)
    if (ticket) return applyLocalValidation(ticket, 'manual', config)

    if (!online) return { status: RESULT.NOT_FOUND }

    // Id do servidor (busca online) — valida remotamente
    try {
      const { data } = await api.post('/api/validation/manual', {
        ticket_id: ticketId,
        event_id: eventId,
        terminal_id: terminalId,
      })
      if (!data || data.status === RESULT.NOT_FOUND) return { status: RESULT.NOT_FOUND }
      await upsertRemoteTicket(data, null)
      return data
    } catch (err) {
      return { status: RESULT.ERROR, reason: err?.response?.data?.error || err?.message || 'Erro na validação.' }
    }
  }, [eventId, terminalId, applyLocalValidation, upsertRemoteTicket])

  /** Consulta sem validar (tela de confirmação do terminal). */
  const lookupTicketCode = useCallback(async (ticketCode) => {
    const code = String(ticketCode || '').trim().toLowerCase()
    if (!code) return { status: RESULT.NOT_FOUND }

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const { data } = await api.get('/api/validation/lookup', {
          params: { code, event_id: eventId },
        })
        return data
      }

      const ticket = await getTicketByCode(code)
      if (!ticket) return { status: RESULT.NOT_FOUND }
      return {
        status: ticket.status,
        ticket_code: ticket.ticket_code,
        display_name: ticket.display_name,
        batch: ticket.batch,
        first_entry_at: ticket.validated_at,
      }
    } catch (err) {
      return { status: RESULT.ERROR, reason: err?.message || 'Erro na consulta.' }
    }
  }, [eventId])

  /**
   * checkoutTicket(ticketCode) — registra saída localmente e tenta sync
   * em background quando on-line.
   */
  const checkoutTicket = useCallback(async (ticketCode) => {
    const code = String(ticketCode || '').trim()
    if (!code) return { status: RESULT.ERROR, reason: 'Código vazio.' }

    const config = await configOf()
    if (config.checkout_enabled === false) {
      return { status: RESULT.ERROR, reason: 'checkout_disabled' }
    }

    const ticket = await getTicketByCode(code)
    if (!ticket) {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const { data } = await api.post('/api/validation/checkout', {
            ticket_code: code,
            event_id: eventId,
            terminal_id: terminalId,
          })
          return data
        } catch (err) {
          return { status: RESULT.ERROR, reason: err?.response?.data?.error || 'checkout_failed' }
        }
      }
      return { status: RESULT.NOT_FOUND }
    }

    if (ticket.status !== 'validated') {
      return { status: RESULT.ERROR, reason: 'not_checked_in' }
    }
    if (ticket.checkout_at) {
      return { status: RESULT.ERROR, reason: 'already_checked_out' }
    }

    const now = nowIso()
    await db.tickets.update(ticket.id, { checkout_at: now, updated_at: now })
    await saveEntryLog({
      ticket_id: ticket.id,
      ticket_code: code,
      event_id: eventId,
      entry_type: 'qrcode',
      terminal_id: terminalId,
      validator_id: user?.id,
      is_duplicate: false,
      checkout_at: now,
      synced: 0,
      created_at: now,
    })

    // Confirma o checkout no servidor em background
    if (typeof navigator === 'undefined' || navigator.onLine) {
      api.post('/api/validation/checkout', {
        ticket_code: code,
        event_id: eventId,
        terminal_id: terminalId,
      }).catch(() => {})
    }

    return {
      status: 'checkout_registered',
      ticket_code: ticket.ticket_code,
      display_name: ticket.display_name,
      checkout_at: now,
    }
  }, [eventId, terminalId, user])

  return {
    lookupTicketCode,
    validateTicket,
    validateTicketCode,
    validateManual,
    checkoutTicket,
  }
}
