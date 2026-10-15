const STATUS_LABEL = {
  active: 'Ingresso válido',
  validated: 'Já validado',
  blocked: 'Ingresso bloqueado',
  cancelled: 'Ingresso cancelado',
  not_found: 'Não encontrado',
}

/**
 * Tela de confirmação exibida ANTES de efetivar a validação.
 * Mostra os dados do ingresso e exige uma ação explícita do operador.
 */
export function ValidationConfirm({ ticket, kind = 'checkin', onConfirm, onCancel, busy = false }) {
  const status = ticket?.status || 'not_found'
  const blocked = status === 'blocked' || status === 'cancelled'
  const actionLabel = kind === 'checkout' ? 'Confirmar saída' : 'Confirmar entrada'

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirmar validação">
      <div className="confirm-card">
        <p className="confirm-kicker">Confirmar validação</p>
        <p className="confirm-name">{ticket?.display_name || 'Sem nome'}</p>

        <div className="confirm-meta">
          {ticket?.batch && <span className="confirm-tag">Lote: {ticket.batch}</span>}
          <span className={`confirm-tag status-${status}`}>{STATUS_LABEL[status] || status}</span>
        </div>

        {ticket?.ticket_code && (
          <p className="confirm-code">{String(ticket.ticket_code).slice(0, 8)}…</p>
        )}

        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${kind === 'checkout' ? 'btn-primary blue' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy || blocked}
          >
            {busy ? 'Validando…' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ValidationConfirm
