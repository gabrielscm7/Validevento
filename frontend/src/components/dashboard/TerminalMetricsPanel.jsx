import { formatTime } from '../../lib/format'

export function TerminalMetricsPanel({ data, loading }) {
  if (loading) {
    return <div className="card card-pad">Carregando métricas…</div>
  }

  const terminals = data || []

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Terminais — Métricas detalhadas</h3>
      </div>

      {terminals.length === 0 && (
        <p className="text-muted text-sm text-center py-4">Nenhum terminal registrado</p>
      )}

      {terminals.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Terminal</th>
                <th>Status</th>
                <th>Validações hoje</th>
                <th>Velocidade média</th>
                <th>Primeira</th>
                <th>Última</th>
                <th>Operador</th>
              </tr>
            </thead>
            <tbody>
              {terminals.map((t) => (
                <tr key={t.id} className={t.suspended ? 'opacity-50' : ''}>
                  <td className="font-medium">{t.name}</td>
                  <td>
                    <span className={`badge ${
                      t.suspended ? 'badge-red' : t.online ? 'badge-green' : 'badge-gray'
                    }`}>
                      {t.suspended ? 'Suspenso' : t.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="text-center">{t.validations_today ?? 0}</td>
                  <td>{t.avg_gap_seconds != null ? `${t.avg_gap_seconds}s` : '—'}</td>
                  <td className="text-sm">{formatTime(t.first_validation_today)}</td>
                  <td className="text-sm">{formatTime(t.last_validation_today)}</td>
                  <td className="text-sm text-muted">{t.operator_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default TerminalMetricsPanel
