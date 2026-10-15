import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  db,
  getTicketByCode,
  getMeta,
  getLastSync,
  saveMeta,
  setEventId,
} from '../services/localDB'
import { useValidation } from '../hooks/useValidation'
import { useTerminalStore } from '../store/terminalStore'
import { useAuthStore } from '../store/authStore'
import { syncWithServer } from '../services/syncService'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../services/api', () => ({
  default: { get: apiMocks.get, post: apiMocks.post },
}))

const EVT = '1e3f7a2b-9c4d-4e5f-8a6b-0c1d2e3f4a5b'

async function seedTicket(overrides = {}) {
  return db.tickets.add({
    ticket_code: 'T1',
    event_id: EVT,
    status: 'active',
    display_name: 'Maria',
    batch: 'LOTE-01',
    origin: 'import',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  })
}

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

// ──────────────────────────────────────────────────────────────
// Máquina de estados offline de useValidation
// ──────────────────────────────────────────────────────────────
describe('useValidation — fluxo offline', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setOnline(true)
    useTerminalStore.setState({
      eventId: EVT, terminalId: 'term-1', gateId: null, isGeneric: false, slug: null,
    })
    useAuthStore.setState({ user: { id: 'u1' } })
    apiMocks.post.mockResolvedValue({ data: { status: 'authorized' } })
    apiMocks.get.mockResolvedValue({ data: { results: [] } })
    await db.tickets.clear()
    await db.entry_logs.clear()
    await db.meta.clear()
    await setEventId(EVT)
    await saveMeta('event_config', { reentry_mode: 'none', checkout_enabled: false })
  })

  async function validate(code) {
    const { result } = renderHook(() => useValidation())
    let res
    await act(async () => { res = await result.current.validateTicket(code) })
    return res
  }

  async function checkout(code) {
    const { result } = renderHook(() => useValidation())
    let res
    await act(async () => { res = await result.current.checkoutTicket(code) })
    return res
  }

  it('T-sync-1: ingresso ativo é autorizado, fica validado e enfileira log', async () => {
    await seedTicket()

    const res = await validate('T1')

    expect(res.status).toBe('authorized')
    const ticket = await getTicketByCode('T1')
    expect(ticket.status).toBe('validated')

    const logs = await db.entry_logs.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      ticket_code: 'T1', entry_type: 'qrcode', synced: 0, is_duplicate: false,
    })
  })

  it('T-sync-2: reentry_mode=none retorna duplicate com first_entry_at', async () => {
    await saveMeta('event_config', { reentry_mode: 'none' })
    await seedTicket({ status: 'validated', validated_at: '2026-09-01T10:00:00.000Z' })

    const res = await validate('T1')

    expect(res.status).toBe('duplicate')
    expect(res.first_entry_at).toBe('2026-09-01T10:00:00.000Z')
    expect(await db.entry_logs.count()).toBe(0)
  })

  it('T-sync-3: reentry_mode=free autoriza reentrada e enfileira novo log', async () => {
    await saveMeta('event_config', { reentry_mode: 'free' })
    await seedTicket({ status: 'validated', validated_at: '2026-09-01T10:00:00.000Z' })

    const res = await validate('T1')

    expect(res.status).toBe('authorized')
    expect(res.reentry).toBe(true)
    expect(await db.entry_logs.count()).toBe(1)
  })

  it('T-sync-4: reentry_mode=conditioned sem checkout retorna duplicate', async () => {
    await saveMeta('event_config', { reentry_mode: 'conditioned' })
    await seedTicket({ status: 'validated' })

    const res = await validate('T1')

    expect(res.status).toBe('duplicate')
  })

  it('T-sync-5: reentry_mode=conditioned com checkout autoriza e zera checkout_at', async () => {
    await saveMeta('event_config', { reentry_mode: 'conditioned' })
    await seedTicket({ status: 'validated', checkout_at: '2026-09-01T12:00:00.000Z' })

    const res = await validate('T1')

    expect(res.status).toBe('authorized')
    expect(res.reentry).toBe(true)
    const ticket = await getTicketByCode('T1')
    expect(ticket.checkout_at).toBeNull()
  })

  it('T-sync-6: ingresso bloqueado retorna blocked', async () => {
    await seedTicket({ status: 'blocked' })

    const res = await validate('T1')

    expect(res.status).toBe('blocked')
  })

  it('T-sync-7: offline e código desconhecido retorna not_found sem tocar a API', async () => {
    setOnline(false)

    const res = await validate('DESCONHECIDO')

    expect(res.status).toBe('not_found')
    expect(apiMocks.get).not.toHaveBeenCalled()
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('T-sync-8: checkout habilitado registra saída local e enfileira log', async () => {
    await saveMeta('event_config', { checkout_enabled: true })
    await seedTicket({ status: 'validated', validated_at: '2026-09-01T10:00:00.000Z' })

    const res = await checkout('T1')

    expect(res.status).toBe('checkout_registered')
    const ticket = await getTicketByCode('T1')
    expect(ticket.checkout_at).toBeTruthy()
    const logs = await db.entry_logs.toArray()
    expect(logs[0].checkout_at).toBeTruthy()
  })

  it('T-sync-9: checkout desabilitado retorna erro checkout_disabled', async () => {
    await saveMeta('event_config', { checkout_enabled: false })
    await seedTicket({ status: 'validated' })

    const res = await checkout('T1')

    expect(res).toMatchObject({ status: 'error', reason: 'checkout_disabled' })
  })

  it('T-sync-10: checkout de ingresso não validado retorna not_checked_in', async () => {
    await saveMeta('event_config', { checkout_enabled: true })
    await seedTicket({ status: 'active' })

    const res = await checkout('T1')

    expect(res).toMatchObject({ status: 'error', reason: 'not_checked_in' })
  })
})

// ──────────────────────────────────────────────────────────────
// syncWithServer — fila offline + regras de merge
// ──────────────────────────────────────────────────────────────
describe('syncWithServer — fila e merge', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setOnline(true)
    useTerminalStore.setState({
      eventId: EVT, terminalId: 'term-1', gateId: null, isGeneric: false, slug: null,
    })
    apiMocks.post.mockImplementation((url) => {
      const u = String(url)
      if (u.endsWith('/heartbeat')) return Promise.resolve({ data: { terminal_id: 'term-1' } })
      if (u.endsWith('/logs')) return Promise.resolve({ data: { errors: [] } })
      return Promise.resolve({ data: {} })
    })
    apiMocks.get.mockResolvedValue({
      data: { tickets: [], last_sync_at: '2026-09-10T12:00:00.000Z', total: 0, event_config: null, master_ticket: null },
    })
    await db.tickets.clear()
    await db.entry_logs.clear()
    await db.meta.clear()
    await setEventId(EVT)
  })

  it('T-sync-11: envia logs pendentes e os marca como sincronizados', async () => {
    await db.entry_logs.add({
      ticket_code: 'T1', entry_type: 'qrcode', synced: 0, created_at: '2026-09-10T10:00:00.000Z',
    })

    const res = await syncWithServer()

    expect(res.logs_sent).toBe(1)
    expect(await db.entry_logs.where('synced').equals(0).count()).toBe(0)
    expect(apiMocks.post).toHaveBeenCalledWith('/api/sync/logs', expect.objectContaining({ event_id: EVT }))
  })

  it('T-sync-12: mantém pendente o log reportado como erro pelo servidor', async () => {
    const id = await db.entry_logs.add({
      ticket_code: 'T1', entry_type: 'qrcode', synced: 0, created_at: '2026-09-10T10:00:00.000Z',
    })
    apiMocks.post.mockImplementation((url) => {
      const u = String(url)
      if (u.endsWith('/logs')) return Promise.resolve({ data: { errors: [{ local_id: id }] } })
      if (u.endsWith('/heartbeat')) return Promise.resolve({ data: {} })
      return Promise.resolve({ data: {} })
    })

    await syncWithServer()

    expect((await db.entry_logs.get(id)).synced).toBe(0)
  })

  it('T-sync-13: não sobrescreve validação local com status remoto terminal', async () => {
    const localId = await db.tickets.add({
      ticket_code: 'T1', event_id: EVT, status: 'validated', updated_at: '2026-09-01T10:00:00.000Z',
    })
    apiMocks.get.mockResolvedValue({
      data: {
        tickets: [{ id: 999, ticket_code: 'T1', event_id: EVT, status: 'blocked', updated_at: '2026-09-10T11:00:00.000Z' }],
        last_sync_at: '2026-09-10T12:00:00.000Z', total: 1, event_config: null, master_ticket: null,
      },
    })

    await syncWithServer()

    const ticket = await getTicketByCode('T1')
    expect(ticket.status).toBe('validated')
    expect(ticket.id).toBe(localId)
  })

  it('T-sync-14: não sobrescreve ticket local mais novo que o snapshot (RN-04)', async () => {
    await db.tickets.add({
      ticket_code: 'T1', event_id: EVT, status: 'active', display_name: 'Local', updated_at: '2026-09-10T12:00:00.000Z',
    })
    apiMocks.get.mockResolvedValue({
      data: {
        tickets: [{ id: 999, ticket_code: 'T1', event_id: EVT, status: 'active', display_name: 'Server', updated_at: '2026-09-10T11:00:00.000Z' }],
        last_sync_at: '2026-09-10T12:00:00.000Z', total: 1, event_config: null, master_ticket: null,
      },
    })

    await syncWithServer()

    expect((await getTicketByCode('T1')).display_name).toBe('Local')
  })

  it('T-sync-15: insere ticket novo vindo do snapshot', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        tickets: [{ id: 1, ticket_code: 'NEW', event_id: EVT, status: 'active', display_name: 'Novo', updated_at: '2026-09-10T11:00:00.000Z' }],
        last_sync_at: '2026-09-10T12:00:00.000Z', total: 1, event_config: null, master_ticket: null,
      },
    })

    await syncWithServer()

    expect(await getTicketByCode('NEW')).toMatchObject({
      status: 'active', display_name: 'Novo', event_id: EVT,
    })
  })

  it('T-sync-16: persiste event_config e last_sync_at', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        tickets: [], last_sync_at: '2026-09-10T12:00:00.000Z', total: 0,
        event_config: { reentry_mode: 'free', checkout_enabled: true }, master_ticket: null,
      },
    })

    await syncWithServer()

    expect(await getMeta('event_config')).toMatchObject({ reentry_mode: 'free', checkout_enabled: true })
    expect(await getLastSync()).toBe('2026-09-10T12:00:00.000Z')
  })

  it('T-sync-17: retorna null quando não há evento configurado', async () => {
    await db.meta.delete('event_id')

    const res = await syncWithServer()

    expect(res).toBeNull()
    expect(apiMocks.get).not.toHaveBeenCalled()
  })
})
