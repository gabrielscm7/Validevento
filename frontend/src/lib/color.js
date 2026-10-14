export function normalizeHex(value) {
  if (!value || typeof value !== 'string') return null
  let hex = value.trim().replace(/^#/, '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return `#${hex.toLowerCase()}`
}

export function hexToRgb(value) {
  const hex = normalizeHex(value)
  if (!hex) return null
  const int = parseInt(hex.slice(1), 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

export function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`
}

export function mix(from, to, amount) {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  if (!a || !b) return from
  const t = Math.max(0, Math.min(1, amount))
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  )
}

export function lighten(value, amount) {
  return mix(value, '#ffffff', amount)
}

export function darken(value, amount) {
  return mix(value, '#000000', amount)
}

export function withAlpha(value, alpha) {
  const rgb = hexToRgb(value)
  if (!rgb) return value
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export function readableOn(value) {
  const rgb = hexToRgb(value)
  if (!rgb) return '#ffffff'
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  return luminance > 0.62 ? '#141019' : '#ffffff'
}
