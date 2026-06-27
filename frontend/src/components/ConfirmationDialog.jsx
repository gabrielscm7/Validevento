function formatDateTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleString('pt-BR')
}

const CONFIG = {
  active:    { bg: 'bg-emerald-600', emoji: '🎟️', title: 'Confirmar Validação',   btn: 'Confirmar Entrada', btnCls: 'bg-white text-emerald-700 hover:bg-emerald-50' },
  validated: { bg: 'bg-amber-500',   emoji: '⚠️', title: 'Ingresso Já Validado',  btn: 'Registrar Entrada', btnCls: 'bg-white text-amber-700 hover:bg-amber-50' },
  blocked:   { bg: 'bg-red-600',     emoji: '🚫', title: 'Ingresso Bloqueado',    btn: null },
  not_found: { bg: 'bg-slate-700',   emoji: '❓', title: 'Não Encontrado',        btn: null },
}

export function ConfirmationDialog({ ticket, loading, onConfirm, onCancel }) {
  if (!ticket) return null

  const status = ticket.status || 'not_found'
  const cfg = CONFIG[status] || CONFIG.not_found
  const needsConfirm = status === 'active' || status === 'validated'

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center
                  ${cfg.bg} animate-fade-in select-none`}
      role="dialog"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-5 p-8 max-w-sm w-full text-center animate-slide-up">
        <span className="text-7xl leading-none" aria-hidden="true">{cfg.emoji}</span>

        <h1 className="text-2xl font-black tracking-wide text-white">
          {cfg.title}
        </h1>

        {ticket.display_name && (
          <p className="text-3xl font-bold text-white">{ticket.display_name}</p>
        )}

        <div className="space-y-1 text-sm text-white/80">
          {ticket.ticket_code && <p>Ingresso: <strong className="font-mono text-xs">{ticket.ticket_code.slice(0, 8)}...</strong></p>}
          {ticket.batch && <p>Lote: <strong>{ticket.batch}</strong></p>}
          {ticket.first_entry_at && (
            <p>1ª entrada: <strong>{formatDateTime(ticket.first_entry_at)}</strong></p>
          )}
          {status === 'validated' && (
            <p className="text-white/90 mt-1 text-sm font-medium">
              Deseja autorizar a reentrada?
            </p>
          )}
        </div>

        {needsConfirm ? (
          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 px-4 rounded-xl bg-white/20 text-white font-semibold
                         hover:bg-white/30 active:scale-[0.97] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold
                         active:scale-[0.97] transition-all disabled:opacity-50 ${cfg.btnCls}`}
            >
              {loading ? 'Validando...' : cfg.btn}
            </button>
          </div>
        ) : (
          <button
            onClick={onCancel}
            className="mt-2 py-3 px-8 rounded-xl bg-white/20 text-white font-semibold
                       hover:bg-white/30 active:scale-[0.97] transition-all"
          >
            OK
          </button>
        )}
      </div>
    </div>
  )
}
