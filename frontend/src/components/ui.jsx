import { Spinner } from './feedback'

/**
 * Botão com estado de loading (spinner) e disable automático.
 */
export function Btn({
  children,
  loading = false,
  disabled,
  variant = 'primary',
  size,
  block,
  className = '',
  ...rest
}) {
  const cls = ['btn', `btn-${variant}`, size ? `btn-${size}` : '', block ? 'btn-block' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

/**
 * Modal simples com backdrop. onClose fecha ao clicar fora / ESC.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
  center = true,
}) {
  if (!open) return null

  return (
    <div className={`backdrop ${center ? 'center' : ''}`} onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose?.()
    }}>
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <div className="modal-head">
            <h3>{title}</h3>
            <button type="button" className="btn-ghost btn-icon" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export default Btn
