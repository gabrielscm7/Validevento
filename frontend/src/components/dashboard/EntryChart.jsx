import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card text-card-foreground border border-border rounded-xl px-3 py-2 text-sm shadow-lg">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{payload[0].value} entradas</p>
    </div>
  )
}

export function EntryChart({ data, loading }) {
  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-4" />
        <div className="h-48 bg-muted rounded" />
      </div>
    )
  }

  const chartData = (data ?? []).map((d) => ({
    hour: d.hour ? d.hour.slice(11, 16) : '',
    count: d.count ?? 0,
  }))

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Fluxo por hora</h3>
      {chartData.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-12">Nenhuma entrada registrada</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="hour"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="count" fill="#4b63f7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
