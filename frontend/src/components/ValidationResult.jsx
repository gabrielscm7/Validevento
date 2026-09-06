import { useEffect } from 'react'
import { playSound } from '../lib/sound'

const CONFIG = {
  authorized: { bg: 'bg-authorized', label: 'Entrada autorizada', tone: '#fff' },
  duplicate: { bg: 'bg-duplicate', label: 'Duplicata detectada', tone: '#fff' },
  not_found: { bg: 'bg-not_found', label: 'Não encontrado', tone: '#fff' },
  blocked: { bg: 'bg-blocked', label: 'Ingresso bloqueado', tone: '#fff' },
  checkout: { bg: 'bg-checkout', label: 'Saída registrada', tone: '#fff' },
  checkout_registered: { bg: 'bg-checkout', label: 'Saída registrada', tone: '#fff' },
  error: { bg: 'bg-error', label: 'Erro na validação', tone: '#fff' },
}

function StatusIcon({ status }) {
  const common = { width: 96, height: 96, viewBox: '0 0 96 96', fill: 'none' }
  if (status === 'authorized' || status === 'checkout' || status === 'checkout_registered') {
    return (
      <svg {...common} className="icon-ok" aria-hidden="true">
        <circle cx="48" cy="48" r="42" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M30 49l13 13 23-27" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'duplicate') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M48 12L86 76H10L48 12z" stroke="#fff" strokeWidth="7" fill="none" strokeLinejoin="round" />
        <path d="M48 38v20" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
        <circle cx="48" cy="68" r="4" fill="#fff" />
      </svg>
    )
  }
  if (status === 'not_found') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="48" cy="48" r="42" stroke="#fff" strokeWidth="7" fill="none" />
        <path d="M34 34l28 28M62 34L34 62" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'blocked') {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="24" y="42" width="48" height="34" rx="7" stroke="#fff" strokeWidth="7" />
        <path d="M38 42V30a10 10 0 0 1 20 0v12" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
        <circle cx="48" cy="59" r="4" fill="#fff" />
      </svg>
    )
  }
  return (
    <svg {...common} aria-hidden="true">
      <circle cx="48" cy="48" r="42" stroke="#fff" strokeWidth="7" fill="none" />
      <path d="M48 26v26" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <circle cx="48" cy="66" r="5" fill="#fff" />
    </svg>
  )
}

/**
 * Overlay de resultado de validação. Some sozinho após 2.5s.
 */
export function ValidationResult({ result, onDismiss, autoDismissMs = 2500 }) {
  const status = result?.status
  const cfg = CONFIG[status] || CONFIG.error

  useEffect(() => {
    if (!status) return
    playSound(status)
    if (!autoDismissMs || !onDismiss) return
    const t = setTimeout(() => onDismiss?.(), autoDismissMs)
    return () => clearTimeout(t)
  }, [status, autoDismissMs, onDismiss])

  if (!status) return null

  return (
    <div
      className={`val-overlay ${cfg.bg}`}
      role="dialog"
      aria-live="assertive"
      onClick={onDismiss}
    >
      <div className="val-icon"><StatusIcon status={status} /></div>
      <p className="val-status">{cfg.label}</p>
      {result?.display_name && <p className="val-name">{result.display_name}</p>}
      {result?.reentry && <span className="badge" style={{ background: 'rgba(255,255,255,.2)' }}>Reentrada</span>}
      <div className="val-detail">
        {result?.batch && <p>Lote: {result.batch}</p>}
        {result?.origin && result.origin !== 'import' && <p>Origem: {result.origin}</p>}
        {result?.first_entry_at && (
          <p>1ª entrada: {new Date(result.first_entry_at).toLocaleString('pt-BR')}</p>
        )}
        {result?.reason && <p>{result.reason}</p>}
        {result?.checkout_at && <p>Saída às {new Date(result.checkout_at).toLocaleTimeString('pt-BR')}</p>}
      </div>
    </div>
  )
}

export default ValidationResult
