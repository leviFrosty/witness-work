import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const jiti = createJiti(import.meta.url, {
  alias: { '@': join(root, 'src') },
})
const art = (file) =>
  jiti.import(join(root, 'src', 'features', 'pet', 'art', file))
const { petSprite, idlePose } = await art('sprite.ts')
const { heartIcon } = await art('hearts.ts')

const hex = (v) => v.toString(16).padStart(2, '0')

const withBox = (px) => {
  let minX = px.width
  let minY = px.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (px.data[(y * px.width + x) * 4 + 3] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return {
    px,
    box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  }
}

export const loadPet = (species, coat = 'default', mood = 'happy') =>
  withBox(petSprite(species, coat, { ...idlePose(mood, 0, 0) }))

export const loadHeart = () => withBox(heartIcon(1))

export const pixelSvg = (
  { px, box },
  { cx, bottom, scale, flip = false, extra = '' }
) => {
  const left = cx - (box.w * scale) / 2
  const top = bottom - box.h * scale
  let out = ''
  for (let y = box.y; y < box.y + box.h; y++) {
    let x = box.x
    while (x < box.x + box.w) {
      const i = (y * px.width + x) * 4
      const a = px.data[i + 3]
      if (a === 0) {
        x++
        continue
      }
      const color = `#${hex(px.data[i])}${hex(px.data[i + 1])}${hex(px.data[i + 2])}`
      let run = 1
      while (x + run < box.x + box.w) {
        const j = (y * px.width + x + run) * 4
        if (
          px.data[j + 3] !== a ||
          px.data[j] !== px.data[i] ||
          px.data[j + 1] !== px.data[i + 1] ||
          px.data[j + 2] !== px.data[i + 2]
        )
          break
        run++
      }
      const col = flip ? box.x + box.w - (x - box.x) - run : x
      const opacity = a === 255 ? '' : ` fill-opacity="${(a / 255).toFixed(3)}"`
      out += `<rect x="${left + (col - box.x) * scale}" y="${top + (y - box.y) * scale}" width="${run * scale + 0.5}" height="${scale + 0.5}" fill="${color}"${opacity}/>`
      x += run
    }
  }
  return `<g shape-rendering="crispEdges" ${extra}>${out}</g>`
}
