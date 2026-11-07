import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { injectManifest } from 'workbox-build'

export const SW_FILE = 'sw.js'

export const MAX_PRECACHED_BYTES = 16 * 1024 * 1024

const ROOT = fileURLToPath(new URL('../', import.meta.url))

export function entryFiles(directory) {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  const urls = [
    ...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g),
    ...html.matchAll(/<link[^>]*\shref="(\/_expo\/[^"]+)"/g),
  ].map((match) => match[1])
  return urls.map((url) => url.replace(/^\//, ''))
}

const CHUNK_DIR = '_expo/static/js/web'

const LOCALE_CHUNK = /^[a-z]{2,3}(?:-[A-Z]{2})?-[0-9a-f]{32}\.js$/

const RECORDER_CHUNK = /^module\.full\.no-external-[0-9a-f]{32}\.js$/

export function precachePatterns(directory) {
  const chunks = fs
    .readdirSync(path.join(directory, CHUNK_DIR))
    .filter(
      (file) =>
        file.endsWith('.js') &&
        !RECORDER_CHUNK.test(file) &&
        (!LOCALE_CHUNK.test(file) || file.startsWith('en-US-'))
    )
    .map((file) => `${CHUNK_DIR}/${file}`)
  return [
    'index.html',
    'favicon.ico',
    'assets/**/*',
    ...chunks,
    ...entryFiles(directory),
  ]
}

export function onDemandRevision(directory) {
  const hash = createHash('sha256')
  for (const file of fs.readdirSync(directory).sort())
    if (file.endsWith('.wasm'))
      hash.update(file).update(fs.readFileSync(path.join(directory, file)))
  return hash.digest('hex').slice(0, 16)
}

export async function buildServiceWorker(directory) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-sw-'))
  try {
    const bundled = path.join(scratch, 'sw.js')
    await build({
      entryPoints: [path.join(ROOT, 'web/sw/sw.ts')],
      outfile: bundled,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      minify: true,
      legalComments: 'none',
      define: {
        'process.env.NODE_ENV': '"production"',
        __WW_ON_DEMAND_REVISION__: JSON.stringify(onDemandRevision(directory)),
      },
      logLevel: 'warning',
    })
    const result = await injectManifest({
      swSrc: bundled,
      swDest: path.join(directory, SW_FILE),
      globDirectory: directory,
      globPatterns: precachePatterns(directory),

      globIgnores: ['**/*.map', '**/*.br'],

      dontCacheBustURLsMatching: /[.-][0-9a-f]{32}\.[A-Za-z0-9]+$/,
      maximumFileSizeToCacheInBytes: MAX_PRECACHED_BYTES,

      modifyURLPrefix: { '': '/' },
    })
    if (result.warnings.length > 0)
      throw new Error(`The service worker: ${result.warnings.join('; ')}`)
    if (result.count === 0)
      throw new Error('The service worker precaches nothing')
    return result
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}
