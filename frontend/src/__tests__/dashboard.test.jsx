import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SummaryCards } from '../components/dashboard/SummaryCards'
import { EntryChart } from '../components/dashboard/EntryChart'

const mocks = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
  getDashboardFlow: vi.fn(),
}))

vi.mock('../services/dashboardService', () => ({
  getDashboardSummary: mocks.getDashboardSummary,
  getDashboardFlow: mocks.getDashboardFlow,
}))

vi.mock('recharts', async () => {
  const mod = await vi.importActual('recharts')
  const { Children, cloneElement } = await import('react')
  return {
    ...mod,
    ResponsiveContainer: ({ children }) => {
      const child = Children.only(children)
      return cloneElement(child, { width: 600, height: 240 })
    },
  }
})

describe('SummaryCards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('T-dash-ui-1: exibe dados vindos do resumo da API', async () => {
    mocks.getDashboardSummary.mockResolvedValue({
      total_tickets: 1045,
      validated: 987,
      occupancy_pct: 94.4,
      active: 50,
      blocked: 8,
      cortesia: 5,
      master_uses: 2,
      duplicate_attempts: 3,
    })

    render(<SummaryCards eventId="evt-1" />)

    await waitFor(() => {
      expect(screen.getByText('1045')).toBeInTheDocument()
    })
    expect(screen.getByText('987')).toBeInTheDocument()
    expect(screen.getByText('94.4%')).toBeInTheDocument()
  })
})

describe('EntryChart', () => {
  beforeEach(() => vi.clearAllMocks())

  it('T-dash-ui-2: renderiza barras para o fluxo da API', async () => {
    mocks.getDashboardFlow.mockResolvedValue([
      { hour: '14:00', checkins: 10, checkouts: 0 },
      { hour: '15:00', checkins: 22, checkouts: 0 },
      { hour: '16:00', checkins: 15, checkouts: 0 },
    ])

    render(<EntryChart eventId="evt-1" />)

    await waitFor(() => {
      expect(screen.getByText(/Fluxo por hora/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /Gráfico de fluxo por hora com 3 barras/i })).toBeInTheDocument()
    })
  })
})
