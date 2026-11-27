#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { DESIGNS } from './designs.mjs'
import { createIds, svgDocument } from './svg.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const iconsDir = join(root, 'src', 'assets', 'icons')
const previewsDir = join(iconsDir, 'previews')

const PREVIEW_SIZE = 300

const args = process.argv.slice(2)
const sheetFlag = args.indexOf('--sheet')
const sheetPath = sheetFlag === -1 ? null : args.splice(sheetFlag, 2)[1]
const names = args.length ? args : Object.keys(DESIGNS)

const unknown = names.filter((name) => !DESIGNS[name])
if (unknown.length) {
  console.error(`Unknown icon(s): ${unknown.join(', ')}`)
  process.exit(1)
}

const render = (name) => {
  const defs = []
  const body = DESIGNS[name](defs, createIds())
  return Buffer.from(svgDocument(`<defs>${defs.join('')}</defs>${body}`))
}

await mkdir(previewsDir, { recursive: true })

const rendered = []
for (const name of names) {
  const full = await sharp(render(name))
    .flatten({ background: '#000000' })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
  const preview = await sharp(full)
    .resize(PREVIEW_SIZE, PREVIEW_SIZE)
    .png({ compressionLevel: 9, palette: true, quality: 95, dither: 0.6 })
    .toBuffer()
  const fullPath = join(iconsDir, `${name}.png`)
  await writeFile(fullPath, full)
  await writeFile(join(previewsDir, `${name}.png`), preview)
  rendered.push({ name, full })
  console.log(
    `wrote ${relative(root, fullPath)} (${Math.round(full.length / 1024)} KB)`
  )
}

if (sheetPath) {
  const tile = 220
  const gap = 28
  const columns = Math.min(7, rendered.length)
  const rows = Math.ceil(rendered.length / columns)
  const mask = Buffer.from(
    `<svg width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" rx="${tile * 0.225}" fill="#fff"/></svg>`
  )
  const tiles = await Promise.all(
    rendered.map(({ full }) =>
      sharp(full)
        .resize(tile, tile)
        .ensureAlpha()
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer()
    )
  )
  await sharp({
    create: {
      width: columns * (tile + gap) + gap,
      height: rows * (tile + gap) + gap,
      channels: 3,
      background: '#3A3A3C',
    },
  })
    .composite(
      tiles.map((input, i) => ({
        input,
        left: gap + (i % columns) * (tile + gap),
        top: gap + Math.floor(i / columns) * (tile + gap),
      }))
    )
    .png()
    .toFile(sheetPath)
  console.log(`wrote ${sheetPath}`)
}
