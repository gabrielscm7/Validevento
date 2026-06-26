export function BatchTable({ data, loading }) {
  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 w-28 bg-muted rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  const rows = data ?? []

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Status por lote</h3>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">Nenhum lote encontrado</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">Lote</th>
                <th className="text-right pb-2 font-medium">Total</th>
                <th className="text-right pb-2 font-medium">Validados</th>
                <th className="text-right pb-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.batch} className="text-foreground">
                  <td className="py-2.5 font-medium">{r.batch}</td>
                  <td className="py-2.5 text-right">{r.total}</td>
                  <td className="py-2.5 text-right">{r.validated}</td>
                  <td className="py-2.5 text-right">
                    <span className={
                      r.occupancy_percentage >= 80 ? 'text-emerald-600 dark:text-emerald-300' :
                      r.occupancy_percentage >= 50 ? 'text-amber-600 dark:text-amber-300' :
                      'text-muted-foreground'
                    }>
                      {r.occupancy_percentage?.toFixed(1)}%
                    </span>
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
