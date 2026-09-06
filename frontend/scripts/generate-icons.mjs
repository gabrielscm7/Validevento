/**
 * Gera os ícones PWA do Validevento (PNG) — logo em roxo sobre fundo escuro.
 * Uso: node scripts/generate-icons.mjs
 * Dependência: pngjs (dev). Saída: public/icons/icon-192.png e icon-512.png
 *
 * Desenho (SVG rasterizado de forma simplificada):
 *  - fundo arredondado com gradiente #4A2368 → #2E516B
 *  - ticket branco com "check" central
 */
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

function lerp(a, b, t) { return a + (b - a) * t }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Distância de um ponto a um segmento (para o check).
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = clamp(t, 0, 1)
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function render(size) {
  const png = new PNG({ width: size, height: size })
  const pad = size * 0.06
  const radius = size * 0.22
  const inner = size - pad * 2

  // proporções do ticket: retângulo arredondado central
  const tx = size * 0.12
  const ty = size * 0.26
  const tw = size * 0.76
  const th = size * 0.48
  const tr = size * 0.12

  // check (como SVG: M~30% 57% L45% 72% L72% 36%)
  const c1 = [size * 0.30, size * 0.57]
  const c2 = [size * 0.46, size * 0.73]
  const c3 = [size * 0.74, size * 0.33]
  const checkW = size * 0.045

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2
      // fundo: gradiente diagonal
      const t = clamp((x + y) / (2 * size), 0, 1)
      let r = lerp(74, 46, t)    // #4A2368 → #2E516B
      let g = lerp(35, 81, t)
      let b = lerp(104, 107, t)

      // máscara arredondada do ícone (canto)
      const cx = Math.min(x + 1, size - 1 - x + 1) // não usado
      const inRadius = roundedIn(x + 0.5, y + 0.5, size, pad, radius)
      if (!inRadius) { png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0; continue }

      // ticket (branco) com arredondamento
      const xp = x + 0.5
      const yp = y + 0.5
      const inTicket = roundedRect(xp, yp, tx, ty, tw, th, tr)
      if (inTicket) {
        // mini "furo" do ticket à direita (círculo)
        const holeX = tx + tw - size * 0.10
        const holeY = ty + th / 2
        if (Math.hypot(xp - holeX, yp - holeY) < size * 0.055) {
          // fundo volta a aparecer
        } else {
          r = 255; g = 255; b = 255
        }
      }

      // check roxo sobre o ticket
      const d1 = distToSegment(xp, yp, ...c1, ...c2)
      const d2 = distToSegment(xp, yp, ...c2, ...c3)
      if (inTicket && (d1 < checkW || d2 < checkW)) {
        r = 74; g = 35; b = 104
      }

      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
  return png
}

function roundedIn(px, py, size, pad, radius) {
  const min = pad
  const max = size - pad
  if (px < min || px > max || py < min || py > max) return false
  // cantos
  const cx = clamp(px, min + radius, max - radius)
  const cy = clamp(py, min + radius, max - radius)
  return Math.hypot(px - cx, py - cy) <= radius + 0.5
}

function roundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false
  const cx = clamp(px, x + r, x + w - r)
  const cy = clamp(py, y + r, y + h - r)
  return Math.hypot(px - cx, py - cy) <= r + 0.5
}

for (const size of [192, 512]) {
  const png = render(size)
  const file = path.join(outDir, `icon-${size}.png`)
  fs.writeFileSync(file, PNG.sync.write(png))
  console.log(`gerado ${file} (${size}x${size})`)
}
