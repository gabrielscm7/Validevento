/**
 * ValidationResult — overlay tela cheia com resultado da validação.
 * Props:
 *   result: { status, display_name, ticket_code, batch, first_entry_at, reason }
 *   onDismiss: () => void
 */

const CONFIG = {
  authorized:    { bg: 'bg-emerald-500', emoji: '✅', label: 'ENTRADA AUTORIZADA',  textColor: 'text-white' },
  duplicate:     { bg: 'bg-amber-500',   emoji: '⚠️', label: 'ENTRADA DUPLICADA',   textColor: 'text-white' },
  blocked:       { bg: 'bg-red-600',     emoji: '🚫', label: 'INGRESSO BLOQUEADO',  textColor: 'text-white' },
  not_found:     { bg: 'bg-slate-700',   emoji: '❓', label: 'NÃO ENCONTRADO',      textColor: 'text-slate-100' },
  invalid_status:{ bg: 'bg-slate-700',   emoji: '⛔', label: 'SEM CPF VINCULADO',   textColor: 'text-slate-100' },
  error:         { bg: 'bg-red-800',     emoji: '💥', label: 'ERRO',                textColor: 'text-white' },
}

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleString('pt-BR')
}

export function ValidationResult({ result, onDismiss }) {
  if (!result) return null
  const cfg = CONFIG[result.status] ?? CONFIG.error

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center
                  ${cfg.bg} animate-fade-in select-none cursor-pointer`}
      onClick={onDismiss}
      role="dialog"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full text-center animate-slide-up">
        {/* Emoji grande */}
        <span className="text-8xl leading-none" aria-hidden="true">{cfg.emoji}</span>

        {/* Label de status */}
        <h1 className={`text-3xl font-black tracking-wide ${cfg.textColor}`}>
          {cfg.label}
        </h1>

        {/* Nome do participante */}
        {result.display_name && (
          <p className={`text-2xl font-bold ${cfg.textColor}`}>
            {result.display_name}
          </p>
        )}

        {/* Dados secundários */}
        <div className={`space-y-1 text-sm ${cfg.textColor} opacity-80`}>
          {result.ticket_code && <p>Ingresso: <strong>{result.ticket_code}</strong></p>}
          {result.batch        && <p>Lote: <strong>{result.batch}</strong></p>}
          {result.first_entry_at && (
            <p>1ª entrada: <strong>{formatDateTime(result.first_entry_at)}</strong></p>
          )}
          {result.reason && <p className="text-base">{result.reason}</p>}
        </div>

        {/* Toque para fechar */}
        <p className={`text-xs ${cfg.textColor} opacity-60 mt-4`}>
          Toque em qualquer lugar para continuar
        </p>
      </div>
    </div>
  )
}
