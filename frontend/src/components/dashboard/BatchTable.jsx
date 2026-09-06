export function BatchTable({ data, loading }) {
  if (loading) {
    return <div className="card card-pad">Carregando lotes…</div>
  }
  const rows = data || []
  return (
    <div className="card">
      <div className="card-pad">
        <div className="card-head"><h3 className="card-title">Lotes</h3></div>
        {rows.length === 0 && <p className="text-muted text-sm text-center py-6">Sem lotes</p>}
      </div>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Lote</th><th className="num">Gerados</th><th className="num">Validados</th><th>%</th></tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.batch}>
                  <td className="font-medium" style={{ color: 'var(--text-strong)' }}>{b.batch}</td>
                  <td className="num">{b.total}</td>
                  <td className="num">{b.validated}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="progress flex-1" style={{ minWidth: 60 }}>
                        <div className="bar purple" style={{ width: `${Math.min(100, b.pct || 0)}%` }} />
                      </div>
                      <span className="text-xs text-muted">{b.pct || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default BatchTable
