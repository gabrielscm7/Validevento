import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { useOffline } from '../hooks/useOffline'
import { SyncStatus } from '../components/SyncStatus'
import { db, setEventId } from '../services/localDB'

const mocks = vi.hoisted(() => ({ syncWithServer: vi.fn(), getLastSync: vi.fn() }))
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../services/api', () => ({
  default: { get: apiMocks.get, post: apiMocks.post },
}))
vi.mock('../services/syncService', () => ({
  syncWithServer: mocks.syncWithServer,
  startAutoSync: vi.fn(),
}))
vi.mock('../services/localDB', async () => {
  const actual = await vi.importActual('../services/localDB')
  return { ...actual, getLastSync: mocks.getLastSync }
})

function Probe() {
  const { isOnline, lastSyncAt } = useOffline()
  return (
    <div>
      <span data-testid="online">{String(isOnline)}</span>
      <span data-testid="lastsync">{lastSyncAt || 'none'}</span>
    </div>
  )
}

describe('useOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLastSync.mockResolvedValue(null)
    mocks.syncWithServer.mockResolvedValue({})
  })

  it('T-offline-1: detecta mudança de rede e sincroniza ao voltar', async () => {
    render(<Probe />)
    expect(screen.getByTestId('online').textContent).toBe('true')

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('online').textContent).toBe('false')
    })

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('online').textContent).toBe('true')
    })
    await waitFor(() => {
      expect(mocks.syncWithServer).toHaveBeenCalled()
    })
  })
})

describe('SyncStatus', () => {
  it('T-offline-2: exibe estado offline com último sync', async () => {
    render(<SyncStatus isOnline={false} lastSyncAt="14:30" />)
    await waitFor(() => {
      expect(screen.getByText(/offline · sync 14:30/i)).toBeInTheDocument()
    })
  })
})

describe('syncWithServer', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.tickets.clear()
    await db.entry_logs.clear()
    await db.meta.clear()
    await setEventId('evt-123')
    apiMocks.post.mockResolvedValue({ data: { terminal_id: 'term-1' } })
  })

  it('T-offline-3: preserva o id local ao mesclar ticket do snapshot', async () => {
    const localId = await db.tickets.add({
      ticket_code: 'ticket-1',
      event_id: 'evt-123',
      status: 'active',
      updated_at: '2026-09-10T10:00:00.000Z',
    })
    apiMocks.get.mockResolvedValueOnce({
      data: {
        tickets: [{
          id: 9999,
          ticket_code: 'ticket-1',
          event_id: 'evt-123',
          status: 'blocked',
          updated_at: '2026-09-10T11:00:00.000Z',
        }],
        last_sync_at: '2026-09-10T11:00:00.000Z',
        total: 1,
      },
    })

    const { syncWithServer } = await vi.importActual('../services/syncService')
    await syncWithServer()

    const tickets = await db.tickets.toArray()
    expect(tickets).toHaveLength(1)
    expect(tickets[0]).toMatchObject({ id: localId, status: 'blocked' })
  })
})
