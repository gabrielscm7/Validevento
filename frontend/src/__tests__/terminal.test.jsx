import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Terminal from '../pages/terminal/Terminal'
import { saveMeta } from '../services/localDB'
import { useAuthStore } from '../store/authStore'

const mocks = vi.hoisted(() => ({
  syncWithServer: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}))
vi.mock('../services/syncService', () => ({
  syncWithServer: mocks.syncWithServer,
  startAutoSync: vi.fn(),
}))
vi.mock('../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
}))

function renderTerminal(eventId = 'evt-1') {
  return render(
    <MemoryRouter initialEntries={[`/terminal/${eventId}`]}>
      <Routes>
        <Route path="/terminal/:eventId" element={<Terminal />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: { id: 'u1', name: 'Ana Validadora', role: 'validator', tenant_id: 't1' },
      token: 'tok',
      isAuthenticated: true,
    })
    mocks.syncWithServer.mockResolvedValue({ tickets_updated: 0, logs_sent: 0 })
    mocks.get.mockResolvedValue({ data: { id: 'evt-1', name: 'Festa do Cliente' } })
  })

  it('T-terminal-1: inicia sync ao montar', async () => {
    renderTerminal()
    await waitFor(() => expect(mocks.syncWithServer).toHaveBeenCalled())
  })

  it('T-terminal-2a: botão master NÃO aparece quando desabilitado', async () => {
    await saveMeta('event_config', {
      checkout_enabled: false,
      master_ticket_enabled: false,
      qrcode_field: 'ticket_code',
      manual_fields: ['display_name'],
    })
    renderTerminal()
    const btn = await screen.findByTestId('master-ticket-btn')
    await waitFor(() => expect(btn).not.toBeVisible())
  })

  it('T-terminal-2b: botão master aparece quando habilitado', async () => {
    await saveMeta('event_config', {
      checkout_enabled: false,
      master_ticket_enabled: true,
      qrcode_field: 'ticket_code',
      manual_fields: ['display_name'],
    })
    renderTerminal()
    const btn2 = await screen.findByTestId('master-ticket-btn')
    await waitFor(() => expect(btn2).toBeVisible())
  })
})
