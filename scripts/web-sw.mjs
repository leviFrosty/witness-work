import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { injectManifest } from 'workbox-build'

/**
 * The web app's service worker (docs/web-offline.md), built after `expo
 * export`: `web/sw/sw.ts` bundled into one self-contained file, with Workbox's
 * `injectManifest` writing in what to precache. `web:build` runs it on every
 * export; `checkExport` then verifies the files it names.
 */
export const SW_FILE = 'sw.js'

/** CanvasKit is about 8 MB; the entry chunk about 15. */
export const MAX_PRECACHED_BYTES = 32 * 1024 * 1024

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/** The script and stylesheet URLs `index.html` loads: the entry chunks. */
export function entryFiles(directory) {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  const urls = [
    ...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g),
    ...html.matchAll(/<link[^>]*\shref="(\/_expo\/[^"]+)"/g),
  ].map((match) => match[1])
  return urls.map((url) => url.replace(/^\//, ''))
}

const CHUNK_DIR = '_expo/static/js/web'

/** A translations chunk: `de-DE-<hash>.js`, `bem-ZM-<hash>.js`, `ar-<hash>.js`. */
const LOCALE_CHUNK = /^[a-z]{2,3}(?:-[A-Z]{2})?-[0-9a-f]{32}\.js$/

/**
 * What the worker precaches, as `globPatterns` of `directory`: the shell, the
 * entry chunk(s), every other chunk that isn't a language (the screens that
 * load on demand, such as the database's), the wasm files, fonts and images,
 * and English's translations (a first visit opens offline in English). The
 * other languages load when picked and the worker keeps them then
 * (`web/sw/sw.ts`).
 */
export function precachePatterns(directory) {
  const chunks = fs
    .readdirSync(path.join(directory, CHUNK_DIR))
    .filter(
      (file) =>
        file.endsWith('.js') &&
        (!LOCALE_CHUNK.test(file) || file.startsWith('en-US-'))
    )
    .map((file) => `${CHUNK_DIR}/${file}`)
  return [
    'index.html',
    'favicon.ico',
    '*.wasm',
    'assets/**/*',
    ...chunks,
    ...entryFiles(directory),
  ]
}

/**
 * Writes `directory/sw.js`. Returns what Workbox reports: the precached files
 * and their total size.
 */
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
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'warning',
    })
    const result = await injectManifest({
      swSrc: bundled,
      swDest: path.join(directory, SW_FILE),
      globDirectory: directory,
      globPatterns: precachePatterns(directory),
      // Workbox skips `node_modules` by default, which is where Expo puts the
      // packaged fonts (`assets/node_modules/@expo-google-fonts/…`).
      globIgnores: ['**/*.map'],
      // Expo names chunks and assets after a hash of their contents.
      dontCacheBustURLsMatching: /[.-][0-9a-f]{32}\.[A-Za-z0-9]+$/,
      maximumFileSizeToCacheInBytes: MAX_PRECACHED_BYTES,
      // Absolute, as the page asks for them.
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
