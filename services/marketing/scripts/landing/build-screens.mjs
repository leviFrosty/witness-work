#!/usr/bin/env node
// Turns the landing page's raw app captures into responsive WebP files and
// writes the manifest the page reads (src/components/landing/screens.json).
//
//   node scripts/landing/build-screens.mjs <captures-dir>
//
// <captures-dir> holds one PNG per screen, named after the manifest key
// (`iphone-home.png`, `ipad-schedule.png`, …). Captures come from the app's
// verify harness with made-up data (see docs in the app repo); the source PNGs
// stay out of git. Needs ImageMagick 7 (`magick`) on PATH.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const outDir = path.join(root, 'public/images/screens')
const manifestPath = path.join(root, 'src/components/landing/screens.json')

const source = process.argv[2]
if (!source) {
  console.error('Usage: build-screens.mjs <captures-dir>')
  process.exit(1)
}

/**
 * Widths per device family: what the page's largest frame for that device needs
 * on 2x and 3x screens, plus a small one for phones.
 */
/** @type {Record<string, number[]>} */
const WIDTHS = {
  iphone: [420, 760],
  duo: [700, 1300],
  ipad: [800, 1500],
  watch: [280, 416],
  widget: [500, 1000],
  android: [420, 760],
}

/** @param {string[]} args */
const magick = (args) =>
  execFileSync('magick', args, { encoding: 'utf8' }).trim()

mkdirSync(outDir, { recursive: true })
/**
 * @type {Record<
 *   string,
 *   { width: number; height: number; widths: number[] }
 * >}
 */
const manifest = {}
for (const file of readdirSync(source).sort()) {
  if (!file.endsWith('.png')) continue
  const name = file.slice(0, -4)
  const family = Object.keys(WIDTHS).find((key) => name.startsWith(`${key}-`))
  if (!family) {
    console.warn(`skip ${file}: no device prefix`)
    continue
  }
  const input = path.join(source, file)
  const [width = 0, height = 0] = magick([
    'identify',
    '-format',
    '%w %h',
    input,
  ])
    .split(' ')
    .map(Number)
  // Never upscale: a capture narrower than a width stands in for it.
  const variants = [
    ...new Set((WIDTHS[family] ?? []).map((w) => Math.min(w, width))),
  ]
  for (const w of variants) {
    magick([
      input,
      '-resize',
      `${w}x`,
      '-strip',
      '-quality',
      family === 'watch' ? '90' : '82',
      '-define',
      'webp:method=6',
      path.join(outDir, `${name}-${w}.webp`),
    ])
  }
  manifest[name] = { width, height, widths: variants }
  console.log(`${name}: ${width}x${height} → ${variants.join(', ')}`)
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${Object.keys(manifest).length} screens`)
