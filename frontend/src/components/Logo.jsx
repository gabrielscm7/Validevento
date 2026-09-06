/**
 * Logo Validevento — SVG inline (ticket + check + pin) + wordmark.
 * Uso:
 *   <Logo size={28} light />                → só o ícone (topo terminal)
 *   <Logo withText />                        → ícone + "VALIDE VENTO"
 *   <Logo withText compact />                → versão compacta (menor)
 *   <Logo withText light />                  → para fundos escuros
 */
const TICKET_PATH =
  'M17 5.5a2 2 0 0 0 2 2v3.4a1 1 0 0 0-1 1V15a1 1 0 0 0 1 1v3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-3a1 1 0 0 0 1-1v-3.1a1 1 0 0 0-1-1V7.5a2 2 0 0 0 2-2V5h10v.5Z'
const CHECK_PATH = 'M9.5 13.2l2 2 3.6-4.1'
const PIN_PATH =
  'M12 2.4A6.1 6.1 0 0 0 5.9 8.5c0 4.6 5.1 9.3 5.6 9.8a.6.6 0 0 0 .9 0c.5-.5 5.7-5.2 5.7-9.8A6.1 6.1 0 0 0 12 2.4Zm0 8.3a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8Z'

export function Logo({
  size = 32,
  withText = false,
  light = false,
  compact = false,
  style,
}) {
  const glyph =
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="vvGrad" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0" stopColor="#4A2368" />
          <stop offset="1" stopColor="#2E516B" />
        </linearGradient>
      </defs>
      <path d={TICKET_PATH} fill="url(#vvGrad)" />
      <path
        d={CHECK_PATH}
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.4" cy="17.4" r="3.4" fill="#fff" />
      <path d={PIN_PATH} fill="#4A2368" />
    </svg>

  if (!withText) {
    return (
      <span className={`vv-logo ${light ? 'light' : ''}`} style={style}>
        {glyph}
      </span>
    )
  }

  return (
    <span className={`vv-logo ${light ? 'light' : ''}`} style={style}>
      {glyph}
      <span
        className="vv-logo-word"
        style={compact ? { fontSize: 14 } : undefined}
      >
        <span className="valide">VALIDE</span>
        <span className="vento">VENTO</span>
      </span>
    </span>
  )
}

export default Logo
