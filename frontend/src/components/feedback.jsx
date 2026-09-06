export function Spinner({ size = 16, dark = false }) {
  return <span className={`spinner ${dark ? 'dark' : ''}`} style={{ width: size, height: size }} />
}

export function PageLoader({ label = 'Carregando…' }) {
  return (
    <div className="page-loading">
      <div className="big-spinner" />
      <span className="text-muted text-sm">{label}</span>
    </div>
  )
}

export function ErrorNotice({ children, title }) {
  return (
    <div className="form-error">
      {title && <strong>{title}</strong>}
      {title && children ? <span> {children}</span> : children}
    </div>
  )
}

export function EmptyState({ title = 'Nada por aqui', sub }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {sub && <p className="empty-sub">{sub}</p>}
    </div>
  )
}
