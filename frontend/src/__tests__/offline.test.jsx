import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { useOffline } from '../hooks/useOffline'
import { SyncStatus } from '../components/SyncStatus'

const mocks = vi.hoisted(() => ({ syncWithServer: vi.fn(), getLastSync: vi.fn() }))
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
