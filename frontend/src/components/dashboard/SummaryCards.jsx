import { useEffect, useState } from 'react'
import { Spinner } from '../feedback'
import { getDashboardSummary } from '../../services/dashboardService'

const CARDS = [
  { key: 'total_tickets', label: 'Total', icon: '🎟', tone: 'purple' },
  { key: 'validated', label: 'Validados', icon: '✅', tone: 'purple' },
  { key: 'active', label: 'Ativos', icon: '🔗', tone: 'blue' },
  { key: 'blocked', label: 'Bloqueados', icon: '🚫', tone: 'blue' },
  { key: 'occupancy_pct', label: 'Ocupação', icon: '📊', tone: 'purple', suffix: '%' },
  { key: 'cortesia', label: 'Cortesias', icon: '🎁', tone: 'gray' },
  { key: 'master_uses', label: 'Usos master', icon: '🎟', tone: 'gray' },
  { key: 'duplicate_attempts', label: 'Duplicatas', icon: '⚠️', tone: 'gray' },
]

export function SummaryCards({ data, eventId, loading }) {
  const [internalData, setInternalData] = useState(data || null)
  const [internalLoading, setInternalLoading] = useState(loading)

  useEffect(() => {
    if (data !== undefined) { setInternalData(data); setInternalLoading(!!loading); return }
    if (!eventId) return
    let mounted = true
    setInternalLoading(true)
    getDashboardSummary(eventId)
      .then((d) => mounted && setInternalData(d))
      .catch(() => mounted && setInternalData(null))
      .finally(() => mounted && setInternalLoading(false))
    return () => { mounted = false }
  }, [data, eventId, loading])

  if (internalLoading) {
    return (
      <div className="grid grid-cols-4 gap-sm">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card metric-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 96 }}>
            <Spinner dark />
          </div>
        ))}
      </div>
    )
  }
  if (!internalData) return null

  return (
    <div className="grid grid-cols-4 gap-sm" data-testid="summary-cards">
      {CARDS.map((c) => {
        const value = internalData[c.key]
        return (
          <div key={c.key} className="card metric-card" data-testid={`summary-${c.key}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`metric-icon ${c.tone}`}>{c.icon}</span>
            </div>
            <p className="metric-label">{c.label}</p>
            <p className="metric-value">
              {value != null ? `${value}${c.suffix || ''}` : '—'}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export default SummaryCards
