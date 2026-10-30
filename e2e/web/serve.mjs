import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Serves a web export the way the web host does (ADR 0037 §3): files as they
 * are, `index.html` for any other path so the app opens its own routes, and a
 * real 404 for a missing hashed chunk.
 */
const root = path.resolve(
  process.argv[2] ?? fileURLToPath(new URL('../../dist', import.meta.url))
)
const port = Number(process.argv[3] ?? process.env.E2E_PORT ?? 8765)
// `0.0.0.0` lets a browser in a container reach it (README.md).
const address = process.env.E2E_LISTEN ?? '127.0.0.1'
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error(`[serve] No web export in ${root}; run pnpm web:build first`)
  process.exit(1)
}

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    let file = path.join(root, path.normalize(decodeURIComponent(url.pathname)))
    if (!file.startsWith(root)) file = root
    const isFile = fs.existsSync(file) && fs.statSync(file).isFile()
    if (!isFile) {
      if (url.pathname.startsWith('/_expo/')) {
        response.writeHead(404).end()
        return
      }
      file = path.join(root, 'index.html')
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
    })
    fs.createReadStream(file).pipe(response)
  })
  .listen(port, address, () =>
    console.log(`[serve] ${root} on http://${address}:${port}`)
  )
