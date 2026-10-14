import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useThemeStore } from '../store/themeStore'
import {
  MODES, ACCENTS, STYLES, DENSITIES, RADII, FONTS,
} from '../lib/theme'

function Icon({ name, size = 18 }) {
  const paths = {
    palette: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H19a2 2 0 0 0 2-2A9 9 0 0 0 12 3Z" />
        <circle cx="7.5" cy="10.5" r="1" />
        <circle cx="12" cy="7.5" r="1" />
        <circle cx="16.5" cy="10.5" r="1" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6L6 18" />,
    reset: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 13.5A8 8 0 0 1 10.5 4a7 7 0 1 0 9.5 9.5Z" />,
    auto: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18" />
        <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" opacity=".25" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

const MODE_ICON = { light: 'sun', dark: 'moon', system: 'auto' }

function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="tz-seg" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className={`tz-seg-item ${value === opt.id ? 'active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.icon && <Icon name={opt.icon} size={15} />}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

export function ThemeCustomizer() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const s = useThemeStore()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (location.pathname.startsWith('/terminal')) return null

  return (
    <>
      <button
        type="button"
        className="tz-fab"
        onClick={() => setOpen(true)}
        aria-label="Personalizar aparência"
        title="Personalizar aparência"
      >
        <Icon name="palette" size={20} />
      </button>

      {open && (
        <div className="tz-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <section className="tz-panel" role="dialog" aria-modal="true" aria-label="Personalização da interface">
            <header className="tz-head">
              <div>
                <p className="tz-eyebrow">Aparência</p>
                <h2 className="tz-title">Personalize o sistema</h2>
              </div>
              <button type="button" className="tz-close" onClick={() => setOpen(false)} aria-label="Fechar">
                <Icon name="close" />
              </button>
            </header>

            <div className="tz-body">
              <div className="tz-group">
                <span className="tz-label">Tema</span>
                <Segmented
                  ariaLabel="Tema"
                  value={s.mode}
                  onChange={s.setMode}
                  options={MODES.map((m) => ({ id: m.id, label: m.label, icon: MODE_ICON[m.id] }))}
                />
              </div>

              <div className="tz-group">
                <div className="tz-label-row">
                  <span className="tz-label">Cor de destaque</span>
                  <span className="tz-value">{ACCENTS.find((a) => a.id === s.accent)?.label}</span>
                </div>
                <div className="tz-swatches">
                  {ACCENTS.filter((a) => a.id !== 'custom').map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`tz-swatch ${s.accent === a.id ? 'active' : ''}`}
                      style={{ background: `linear-gradient(135deg, ${a.primary}, ${a.secondary})` }}
                      onClick={() => s.setAccent(a.id)}
                      aria-label={a.label}
                      title={a.label}
                    />
                  ))}
                  <label className={`tz-swatch tz-swatch-custom ${s.accent === 'custom' ? 'active' : ''}`} title="Personalizado">
                    <input
                      type="color"
                      value={s.customPrimary}
                      onChange={(e) => { s.setCustomPrimary(e.target.value); s.setAccent('custom') }}
                      aria-label="Cor personalizada"
                    />
                  </label>
                </div>
                {s.accent === 'custom' && (
                  <div className="tz-custom-row">
                    <label className="tz-custom-field">
                      <span>Primária</span>
                      <input type="color" value={s.customPrimary} onChange={(e) => s.setCustomPrimary(e.target.value)} />
                    </label>
                    <label className="tz-custom-field">
                      <span>Secundária</span>
                      <input type="color" value={s.customSecondary} onChange={(e) => s.setCustomSecondary(e.target.value)} />
                    </label>
                  </div>
                )}
              </div>

              <div className="tz-group">
                <span className="tz-label">Estilo dos cartões</span>
                <div className="tz-cards">
                  {STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      className={`tz-style-card ${s.style === st.id ? 'active' : ''}`}
                      onClick={() => s.setStyle(st.id)}
                    >
                      <span className={`tz-style-preview tz-style-preview-${st.id}`} />
                      <span className="tz-style-name">{st.label}</span>
                      <span className="tz-style-desc">{st.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="tz-group">
                <span className="tz-label">Cantos</span>
                <Segmented
                  ariaLabel="Cantos"
                  value={s.radius}
                  onChange={s.setRadius}
                  options={RADII}
                />
              </div>

              <div className="tz-group">
                <span className="tz-label">Densidade</span>
                <Segmented
                  ariaLabel="Densidade"
                  value={s.density}
                  onChange={s.setDensity}
                  options={DENSITIES}
                />
              </div>

              <div className="tz-group">
                <span className="tz-label">Tipografia</span>
                <select className="tz-select" value={s.font} onChange={(e) => s.setFont(e.target.value)}>
                  {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>

              <div className="tz-toggle-row">
                <div>
                  <span className="tz-label">Animações</span>
                  <p className="tz-hint">Movimentos e transições da interface</p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={s.motion} onChange={(e) => s.setMotion(e.target.checked)} />
                  <span className="track" />
                </label>
              </div>
            </div>

            <footer className="tz-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={s.reset}>
                <Icon name="reset" size={15} />
                Restaurar padrão
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
                Concluir
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

export default ThemeCustomizer
