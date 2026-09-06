import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Login from '../pages/Login'
import { useAuthStore } from '../store/authStore'

// Mock do axios (services/api) — authStore.login depende dele.
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}))

vi.mock('../services/api', () => ({
  default: { post: mocks.post, get: mocks.get, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<div>HOME_ADMIN</div>} />
        <Route path="/terminal/:eventId" element={<div>HOME_TERMINAL</div>} />
        <Route path="/master" element={<div>HOME_MASTER</div>} />
        <Route path="/sem-evento" element={<div>SEM_EVENTO</div>} />
      </Routes>
    </MemoryRouter>
  )
}

async function fillLogin({ cpf, password }) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/CPF/i), cpf)
  await user.type(screen.getByLabelText('Senha'), password)
  return user
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().logout()
    window.localStorage.clear()
  })

  it('T-login-1: aplica máscara no CPF', async () => {
    renderLogin()
    const cpfInput = screen.getByLabelText(/CPF/i)
    await userEvent.type(cpfInput, '11122233344')
    await waitFor(() => {
      expect(cpfInput).toHaveValue('111.222.333-44')
    })
  })

  it('T-login-2: erro email_not_verified exibe mensagem correta', async () => {
    mocks.post.mockRejectedValueOnce({
      response: { data: { error: 'email_not_verified' } },
    })
    renderLogin()
    await fillLogin({ cpf: '11122233344', password: 'segredo123' })
    await userEvent.click(screen.getByRole('button', { name: /Entrar/i }))
    await waitFor(() => {
      expect(screen.getByText(/Confirme seu e-mail antes de acessar/i)).toBeInTheDocument()
    })
  })

  it('T-login-3: erro tenant_suspended exibe mensagem correta', async () => {
    mocks.post.mockRejectedValueOnce({
      response: { data: { error: 'tenant_suspended' } },
    })
    renderLogin()
    await fillLogin({ cpf: '11122233344', password: 'segredo123' })
    await userEvent.click(screen.getByRole('button', { name: /Entrar/i }))
    await waitFor(() => {
      expect(screen.getByText(/Acesso suspenso/i)).toBeInTheDocument()
    })
  })

  it('T-login-4: redireciona para /terminal/:eventId quando role=validator com lastEventId', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        token: 'abc',
        user: { id: '1', name: 'Validador', role: 'validator', tenant_id: 't1', lastEventId: 'evt-123' },
      },
    })
    renderLogin()
    await fillLogin({ cpf: '11122233344', password: 'segredo123' })
    await userEvent.click(screen.getByRole('button', { name: /Entrar/i }))
    await waitFor(() => {
      expect(screen.getByText('HOME_TERMINAL')).toBeInTheDocument()
    })
  })

  it('T-login-5: redireciona para /admin quando role=admin', async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        token: 'abc',
        user: { id: '2', name: 'Admin', role: 'admin', tenant_id: 't1' },
      },
    })
    renderLogin()
    await fillLogin({ cpf: '11122233344', password: 'segredo123' })
    await userEvent.click(screen.getByRole('button', { name: /Entrar/i }))
    await waitFor(() => {
      expect(screen.getByText('HOME_ADMIN')).toBeInTheDocument()
    })
  })
})
