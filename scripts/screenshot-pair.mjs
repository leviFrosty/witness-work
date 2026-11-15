#!/usr/bin/env node
import sharp from 'sharp'

const args = process.argv.slice(2)
const heightFlag = args.indexOf('--height')
const targetHeight =
  heightFlag === -1 ? 1000 : Number(args.splice(heightFlag, 2)[1])
const [beforePath, afterPath, outPath] = args
if (!beforePath || !afterPath || !outPath || !(targetHeight > 0)) {
  console.error(
    'Usage: node scripts/screenshot-pair.mjs <before.png> <after.png> <out.png> [--height 1000]'
  )
  process.exit(1)
}

const maxWidth = 2400
const gap = 48

const halves = await Promise.all(
  [beforePath, afterPath].map(async (path) => {
    const { width, height } = await sharp(path).metadata()
    return { path, width, height }
  })
)
const imagesWidth = halves.reduce(
  (sum, half) => sum + (half.width * targetHeight) / half.height,
  0
)
const height = Math.floor(
  targetHeight * Math.min(1, (maxWidth - gap) / imagesWidth)
)
const resized = await Promise.all(
  halves.map(async (half) => {
    const width = Math.round((half.width * height) / half.height)
    const input = await sharp(half.path)
      .resize({ width, height })
      .png()
      .toBuffer()
    return { input, width }
  })
)
const [before, after] = resized

await sharp({
  create: {
    width: before.width + gap + after.width,
    height,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: before.input, left: 0, top: 0 },
    { input: after.input, left: before.width + gap, top: 0 },
  ])
  .png()
  .toFile(outPath)

console.log(`${outPath} (${before.width + gap + after.width}×${height})`)
