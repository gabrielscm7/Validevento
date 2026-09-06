import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ValidationResult } from '../components/ValidationResult'
import { SearchPanel } from '../components/SearchPanel'
import { useTerminalStore } from '../store/terminalStore'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../services/api', () => ({
  default: { get: mocks.get, post: mocks.post },
}))

describe('ValidationResult', () => {
  it('T-val-1: exibe verde e nome para authorized', () => {
    const { container } = render(
      <ValidationResult result={{ status: 'authorized', display_name: 'Maria S.' }} onDismiss={() => {}} />
    )
    const overlay = container.querySelector('.val-overlay')
    expect(overlay).toHaveClass('bg-authorized')
    expect(screen.getByText('Maria S.')).toBeInTheDocument()
  })

  it('T-val-2: exibe fundo amarelo/âmbar para duplicate', () => {
    const { container } = render(
      <ValidationResult result={{ status: 'duplicate', display_name: 'Maria S.' }} onDismiss={() => {}} />
    )
    expect(container.querySelector('.val-overlay')).toHaveClass('bg-duplicate')
  })

  it('T-val-3: some após 2.5 segundos', async () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    function Harness() {
      const [res, setRes] = useState({ status: 'authorized', display_name: 'Maria S.' })
      return (
        <ValidationResult
          result={res}
          onDismiss={() => { onDismiss(); setRes(null) }}
        />
      )
    }
    try {
      render(<Harness />)
      expect(screen.getByText('Maria S.')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2500)
      })

      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Maria S.')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTerminalStore.setState({ eventId: 'evt-123', terminalId: 'term-1' })
  })

  it('T-val-4: busca por nome com debounce (uma chamada) e exibe resultados', async () => {
    mocks.get.mockResolvedValueOnce({
      data: {
        results: [
          { ticket_id: 'a1', ticket_code: '1111', display_name: 'Carlos Almeida', batch: 'LOTE-01', status: 'active' },
          { ticket_id: 'a2', ticket_code: '2222', display_name: 'Carla Souza', batch: 'LOTE-01', status: 'active' },
        ],
      },
    })

    render(<SearchPanel open onClose={() => {}} onConfirm={() => {}} />)

    const input = screen.getByPlaceholderText(/Digite nome ou código/i)
    await userEvent.type(input, 'car')

    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledTimes(1)
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/validation/search', {
      params: { event_id: 'evt-123', q: 'car' },
    })

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /Confirmar entrada/i })
      expect(buttons).toHaveLength(2)
    })
  })
})
