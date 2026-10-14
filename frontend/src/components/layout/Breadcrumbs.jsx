import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { resolveBreadcrumb } from '../../lib/breadcrumb'

export function Breadcrumbs({ pathname, eventName, crumb }) {
  let crumbs = resolveBreadcrumb(pathname, { eventName })
  if (crumb && crumbs.length === 1) crumbs = [{ label: crumb, to: null }]
  if (!crumbs.length) return null

  return (
    <nav className="crumbs" aria-label="Trilha de navegação">
      {crumbs.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 && <span className="crumbs-sep" aria-hidden="true">›</span>}
          {i === crumbs.length - 1 ? (
            <span className="crumbs-current" aria-current="page">{c.label}</span>
          ) : c.to ? (
            <Link className="crumbs-link" to={c.to}>{c.label}</Link>
          ) : (
            <span className="crumbs-muted">{c.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}

export default Breadcrumbs
