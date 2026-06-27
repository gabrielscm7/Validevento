import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST = join(__dirname, 'dist')

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const PORT = process.env.PORT || 3000

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    let filePath = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname)

    let data
    try { data = await readFile(filePath) }
    catch {
      filePath = join(DIST, 'index.html')
      data = await readFile(filePath)
    }

    const ext = extname(filePath)
    const base = basename(filePath)

    // HTML e service worker: nunca em cache (força atualização)
    const noCache = ext === '.html' || base === 'registerSW.js' || base === 'sw.js'

    const headers = { 'Content-Type': MIME[ext] || 'text/plain' }

    if (noCache) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    } else {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    }

    res.writeHead(200, headers)
    res.end(data)
  } catch {
    res.writeHead(500)
    res.end('Internal Server Error')
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend Validevento rodando na porta ${PORT}`)
})
