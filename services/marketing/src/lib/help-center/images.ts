import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { IMAGE_NAME, type HelpImage } from './markdown.ts'
import { HELP_BASE, SITE_URL } from './paths.ts'

export const HELP_IMAGES_DIR = 'content/help/images'
export const HELP_IMAGES_BASE = `${HELP_BASE}/images`

export function webpSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length < 30 || text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP')
    return null
  const chunk = text(12, 16)
  const u16 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8)
  const u24 = (at: number) => u16(at) | (bytes[at + 2]! << 16)
  if (chunk === 'VP8X') return { width: u24(24) + 1, height: u24(27) + 1 }
  if (chunk === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a)
      return null
    return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return null
    const bits =
      (bytes[21]! |
        (bytes[22]! << 8) |
        (bytes[23]! << 16) |
        (bytes[24]! << 24)) >>>
      0
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  return null
}

export type LoadedImage = HelpImage & { file: string; servedPath: string }

export async function loadHelpImages(
  root: string,
  problems: string[]
): Promise<Map<string, LoadedImage>> {
  const dir = path.join(root, HELP_IMAGES_DIR)
  const images = new Map<string, LoadedImage>()
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return images
  }
  for (const name of names.sort()) {
    if (name.startsWith('.')) continue
    const file = path.join(dir, name)
    if (!IMAGE_NAME.test(name)) {
      problems.push(
        `${HELP_IMAGES_DIR}/${name}: screenshots are lowercase .webp files named after their answer, like submit-report.webp (pnpm help:image)`
      )
      continue
    }
    const bytes = new Uint8Array(await readFile(file))
    const size = webpSize(bytes)
    if (!size) {
      problems.push(`${HELP_IMAGES_DIR}/${name}: not a readable WebP image`)
      continue
    }
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    const servedPath = `${HELP_IMAGES_BASE}/${name.replace(/\.webp$/, '')}.${hash}.webp`
    images.set(name, {
      name,
      id: `help-${hash}`,
      src: new URL(servedPath, SITE_URL).href,
      ...size,
      file,
      servedPath,
    })
  }
  return images
}
