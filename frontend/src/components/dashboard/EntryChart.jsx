import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { getDashboardFlow } from '../../services/dashboardService'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card card-pad" style={{ padding: 10, boxShadow: 'var(--shadow)' }}>
      <p className="font-medium text-sm" style={{ color: 'var(--text-strong)' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-xs mt-1">
          {p.dataKey === 'checkins' ? 'Entradas' : 'Saídas'}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export function EntryChart({ data, eventId, loading }) {
  const [internalData, setInternalData] = useState(data || null)
  const [internalLoading, setInternalLoading] = useState(loading)

  useEffect(() => {
    if (data !== undefined) { setInternalData(data); setInternalLoading(!!loading); return }
    if (!eventId) return
    let mounted = true
    setInternalLoading(true)
    getDashboardFlow(eventId)
      .then((d) => mounted && setInternalData(d))
      .catch(() => mounted && setInternalData([]))
      .finally(() => mounted && setInternalLoading(false))
    return () => { mounted = false }
  }, [data, eventId, loading])

  if (internalLoading) {
    return <div className="card card-pad" style={{ minHeight: 220 }}>Carregando fluxo…</div>
  }

  const chartData = (internalData || []).map((d) => ({
    hour: d.hour || '',
    checkins: d.checkins ?? 0,
    checkouts: d.checkouts ?? 0,
  }))
  const hasCheckout = chartData.some((d) => d.checkouts > 0)

  return (
    <div className="card card-pad" data-testid="entry-chart">
      <div className="card-head">
        <h3 className="card-title">Fluxo por hora</h3>
      </div>
      {chartData.length === 0 ? (
        <p className="text-muted text-sm text-center py-8">Nenhum movimento registrado hoje</p>
      ) : (
        <div role="img" aria-label={`Gráfico de fluxo por hora com ${chartData.length} barras`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <XAxis dataKey="hour" tick={{ fill: 'var(--vv-gray)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--vv-gray)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--vv-purple-light)' }} />
              <Bar dataKey="checkins" name="Entradas" fill="#4A2368" radius={[4, 4, 0, 0]} />
              {hasCheckout && <Bar dataKey="checkouts" name="Saídas" fill="#2E516B" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default EntryChart
