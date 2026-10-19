import { crop, scaleNearest, type PixelBuffer } from '@/lib/pixelArt'
import { composeScene, VIEW_CARD, type PlayerInput } from '@/features/pet/art'

/** How many image pixels each scene pixel becomes in a shared picture. */
export const PET_SHARE_SCALE = 4

/**
 * The Home card's room as a still picture, `PET_SHARE_SCALE` times larger with
 * nearest scaling so the pixels stay sharp. The pet sits at rest; particles and
 * motions are left out.
 */
export function petShareImage(input: PlayerInput): PixelBuffer {
  const frame = composeScene({ ...input, particles: null }, 0)
  return scaleNearest(crop(frame, VIEW_CARD), PET_SHARE_SCALE)
}

/**
 * The shared picture's file name: the pet's shown name and the day, e.g.
 * `Ari-2026-10-18.png`. Letters and digits of any script stay; anything else
 * becomes a dash.
 */
export function petShareFileName(name: string, dayKey: string): string {
  const safe = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${safe || 'pet'}-${dayKey}.png`
}
