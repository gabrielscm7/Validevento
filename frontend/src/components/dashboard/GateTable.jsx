export function GateTable({ data, loading }) {
  if (loading) return <div className="card card-pad">Carregando portões…</div>
  const rows = data || []

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Validações por portão</h3>
        <span className="badge badge-gray">{rows.reduce((sum, row) => sum + row.validations, 0)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma validação registrada.</p>
      ) : (
        <div className="grid gap-sm">
          {rows.map((row) => (
            <div key={row.id || 'default'} className="flex items-center justify-between entity-row">
              <span className="font-medium" style={{ color: 'var(--text-strong)' }}>{row.name}</span>
              <span className="badge badge-blue">{row.validations}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default GateTable
