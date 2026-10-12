#!/usr/bin/env node
// Renders the Android tab bar icons in src/assets/tab-icons/ from the Material
// Symbols SVGs in its svg/ folder. Android's native tab bar loads icons as
// bitmaps (iOS uses SF Symbols instead), so each SVG becomes one 4x PNG that
// Android scales down to the bar's 24dp icon.
//
// Uses CanvasKit from @shopify/react-native-skia's web dependency.
//
// Run: node scripts/generate-tab-icons.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const CanvasKitInit = require('canvaskit-wasm')

const SCALE = 4
const SIZE = 24 * SCALE
const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/assets/tab-icons'
)

const CanvasKit = await CanvasKitInit({
  locateFile: (file) => join(dirname(require.resolve('canvaskit-wasm')), file),
})

for (const file of readdirSync(join(dir, 'svg')).filter((name) =>
  name.endsWith('.svg')
)) {
  const svg = readFileSync(join(dir, 'svg', file), 'utf8')
  const [minX, minY, width, height] = svg
    .match(/viewBox="([^"]+)"/)[1]
    .split(/\s+/)
    .map(Number)
  const surface = CanvasKit.MakeSurface(SIZE, SIZE)
  const canvas = surface.getCanvas()
  canvas.clear(CanvasKit.TRANSPARENT)
  canvas.scale(SIZE / width, SIZE / height)
  canvas.translate(-minX, -minY)
  const paint = new CanvasKit.Paint()
  paint.setAntiAlias(true)
  paint.setColor(CanvasKit.BLACK)
  for (const [, d] of svg.matchAll(/<path d="([^"]+)"/g)) {
    canvas.drawPath(CanvasKit.Path.MakeFromSVGString(d), paint)
  }
  const png = surface.makeImageSnapshot().encodeToBytes()
  writeFileSync(join(dir, file.replace(/\.svg$/, `@${SCALE}x.png`)), png)
  surface.delete()
}
