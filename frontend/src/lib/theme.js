import {
  normalizeHex, lighten, darken, mix, readableOn, withAlpha,
} from './color'

export const DEFAULT_SETTINGS = {
  mode: 'system',
  accent: 'violet',
  customPrimary: '#4A2368',
  customSecondary: '#2E516B',
  style: 'classic',
  radius: 'soft',
  font: 'montserrat',
  density: 'cozy',
  motion: true,
}

export const MODES = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
  { id: 'system', label: 'Sistema' },
]

export const ACCENTS = [
  { id: 'violet', label: 'Violeta', primary: '#4A2368', secondary: '#2E516B' },
  { id: 'ocean', label: 'Oceano', primary: '#1E5A8A', secondary: '#0E7490' },
  { id: 'emerald', label: 'Esmeralda', primary: '#0F766E', secondary: '#15803D' },
  { id: 'sunset', label: 'Pôr do sol', primary: '#B4530A', secondary: '#9D174D' },
  { id: 'rose', label: 'Rubi', primary: '#9D174D', secondary: '#6D28D9' },
  { id: 'graphite', label: 'Grafite', primary: '#334155', secondary: '#1E293B' },
  { id: 'custom', label: 'Personalizado' },
]

export const STYLES = [
  { id: 'classic', label: 'Clássico', desc: 'Cartões com sombra suave' },
  { id: 'glass', label: 'Cristal', desc: 'Vidro translúcido desfocado' },
  { id: 'minimal', label: 'Minimalista', desc: 'Plano, só contornos' },
]

export const DENSITIES = [
  { id: 'cozy', label: 'Amplo' },
  { id: 'compact', label: 'Compacto' },
]

export const RADII = [
  { id: 'sharp', label: 'Retos' },
  { id: 'soft', label: 'Suaves' },
  { id: 'round', label: 'Arredondados' },
]

export const FONTS = [
  { id: 'montserrat', label: 'Montserrat + Inter', display: "'Montserrat', sans-serif", body: "'Inter', sans-serif" },
  { id: 'geist', label: 'Geist', display: "'Geist Variable', 'Geist', sans-serif", body: "'Geist Variable', 'Geist', sans-serif" },
  { id: 'system', label: 'Sistema', display: 'system-ui, sans-serif', body: 'system-ui, sans-serif' },
]

const RADIUS_SCALE = {
  sharp: { sm: '3px', base: '5px', lg: '8px' },
  soft: { sm: '6px', base: '10px', lg: '14px' },
  round: { sm: '10px', base: '16px', lg: '22px' },
}

export function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveIsDark(mode) {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return prefersDark()
}

export function resolveAccent(settings) {
  if (settings.accent === 'custom') {
    return {
      primary: normalizeHex(settings.customPrimary) || DEFAULT_SETTINGS.customPrimary,
      secondary: normalizeHex(settings.customSecondary) || DEFAULT_SETTINGS.customSecondary,
    }
  }
  const found = ACCENTS.find((a) => a.id === settings.accent) || ACCENTS[0]
  return { primary: found.primary, secondary: found.secondary }
}

export function buildVars(settings) {
  const isDark = resolveIsDark(settings.mode)
  const { primary, secondary } = resolveAccent(settings)
  const scale = RADIUS_SCALE[settings.radius] || RADIUS_SCALE.soft
  const font = FONTS.find((f) => f.id === settings.font) || FONTS[0]

  const softBase = isDark ? '#0b0f17' : '#ffffff'
  const softAmount = isDark ? 0.84 : 0.9

  return {
    '--accent': primary,
    '--accent-mid': lighten(primary, isDark ? 0.28 : 0.2),
    '--accent-dark': darken(primary, 0.14),
    '--accent-soft': mix(primary, softBase, softAmount),
    '--accent-contrast': readableOn(primary),
    '--accent-glow': withAlpha(primary, isDark ? 0.35 : 0.22),

    '--accent-2': secondary,
    '--accent-2-mid': lighten(secondary, isDark ? 0.28 : 0.2),
    '--accent-2-soft': mix(secondary, softBase, softAmount),

    '--radius-sm': scale.sm,
    '--radius': scale.base,
    '--radius-lg': scale.lg,

    '--font-display': font.display,
    '--font-body': font.body,
  }
}

export function applyTheme(settings) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const isDark = resolveIsDark(settings.mode)

  root.dataset.theme = isDark ? 'dark' : 'light'
  root.dataset.mode = settings.mode
  root.dataset.style = settings.style
  root.dataset.density = settings.density
  root.dataset.motion = settings.motion ? 'on' : 'off'

  const vars = buildVars(settings)
  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value))

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isDark ? '#0b0f17' : vars['--accent'])
}
