import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' })
    res.end(data)
  } catch {
    res.writeHead(500)
    res.end('Internal Server Error')
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend Validevento rodando na porta ${PORT}`)
})
