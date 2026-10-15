import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import JoinTerminal from '../pages/terminal/JoinTerminal'
import Terminal from '../pages/terminal/Terminal'
import { useTerminalStore } from '../store/terminalStore'
import { saveMeta } from '../services/localDB'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  syncWithServer: vi.fn(),
}))

vi.mock('../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
}))
vi.mock('../services/syncService', () => ({
  syncWithServer: mocks.syncWithServer,
  startAutoSync: vi.fn(),
}))

const SLUG = 'ABC123'
const EVENT_ID = '1e3f7a2b-9c4d-4e5f-8a6b-0c1d2e3f4a5b'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.syncWithServer.mockResolvedValue({})
})

describe('Acesso genérico por slug', () => {
  it('T-join-renders: página de join mostra terminal e evento', async () => {
    mocks.get.mockResolvedValue({
      data: {
        terminal_id: 't1',
        terminal_name: 'Portaria 1',
        event_id: EVENT_ID,
        event_name: 'Festa Genérica',
        event_config: { checkout_enabled: false },
      },
    })

    render(
      <MemoryRouter initialEntries={[`/terminal/join/${SLUG}`]}>
        <Routes>
          <Route path="/terminal/join/:slug" element={<JoinTerminal />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Portaria 1')).toBeInTheDocument()
    expect(screen.getByText('Festa Genérica')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Entrar como validador/i })).toBeInTheDocument()
  })

  it('T-join-enter: clique em Entrar dispara o POST e navega para o terminal', async () => {
    mocks.get.mockResolvedValue({
      data: {
        terminal_id: 't1',
        terminal_name: 'Portaria 1',
        event_id: EVENT_ID,
        event_name: 'Festa Genérica',
        event_config: { checkout_enabled: false },
      },
    })
    mocks.post.mockResolvedValue({
      data: {
        terminal_id: 't1',
        terminal_name: 'Portaria 1',
        event_id: EVENT_ID,
        event_name: 'Festa Genérica',
        event_config: { checkout_enabled: false },
      },
    })

    render(
      <MemoryRouter initialEntries={[`/terminal/join/${SLUG}`]}>
        <Routes>
          <Route path="/terminal/join/:slug" element={<JoinTerminal />} />
          <Route path="/terminal/join/:slug/app" element={<div>TERMINAL APP</div>} />
        </Routes>
      </MemoryRouter>
    )

    const button = await screen.findByRole('button', { name: /Entrar como validador/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith(
        `/api/terminal/join/${SLUG}/open`,
        expect.objectContaining({ operator_name: null })
      )
    })
    expect(await screen.findByText('TERMINAL APP')).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível entrar no terminal/i)).toBeNull()
  })

  it('T-terminal-generic-sem-avatar: modo genérico não mostra avatar do usuário', async () => {
    useTerminalStore.setState({
      isGeneric: true,
      slug: SLUG,
      eventId: EVENT_ID,
      terminalId: 't1',
    })
    await saveMeta('event_name', 'Festa Genérica')

    mocks.get.mockImplementation((url) => {
      if (url.endsWith('/gates')) return Promise.resolve({ data: [] })
      if (url.endsWith('/gate')) return Promise.resolve({ data: { gate_id: null, gate_open: false } })
      return Promise.resolve({ data: {} })
    })

    const { container } = render(
      <MemoryRouter initialEntries={[`/terminal/join/${SLUG}/app`]}>
        <Routes>
          <Route path="/terminal/join/:slug/app" element={<Terminal />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(container.querySelector('#qr-reader-region')).toBeTruthy())
    expect(container.querySelector('.avatar')).toBeNull()
    expect(screen.queryByText('Dashboard')).toBeNull()
  })
})
