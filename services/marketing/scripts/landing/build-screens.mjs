#!/usr/bin/env node

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

const WIDTHS = {
  iphone: [420, 760],
  duo: [700, 1300],
  ipad: [800, 1500],
  watch: [280, 416],
  widget: [500, 1000],
  android: [420, 760],
}

const magick = (args) =>
  execFileSync('magick', args, { encoding: 'utf8' }).trim()

mkdirSync(outDir, { recursive: true })

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
