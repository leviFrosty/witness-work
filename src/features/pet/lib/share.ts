import { crop, scaleNearest, type PixelBuffer } from '@/lib/pixelArt'
import { shownStreak, type ServiceStreak } from '@/lib/serviceStreak'
import { composeScene, VIEW_CARD, type PlayerInput } from '@/features/pet/art'
import { daysBetween } from '@/features/pet/lib/dayKeys'

/** How many image pixels each scene pixel becomes in a shared picture. */
export const PET_SHARE_SCALE = 4

/**
 * The Home card's room as a still picture, `scale` times larger with nearest
 * scaling so the pixels stay sharp. The pet sits at rest; particles and motions
 * are left out. The wall sign is left off unless `showSign`: every sign shows
 * the User's records (hours, goal, plans, visits), so the picture shares them
 * only when the User asks.
 */
export function petShareImage(
  input: PlayerInput,
  scale = PET_SHARE_SCALE,
  showSign = false
): PixelBuffer {
  const room = showSign ? input.room : { ...input.room, sign: 'none' as const }
  const frame = composeScene({ ...input, room, particles: null }, 0)
  return scaleNearest(crop(frame, VIEW_CARD), scale)
}

/** The fun facts on the share card. */
export type PetShareStats = {
  /** The Service Streak as people see it; null while hidden or too short. */
  streak: Pick<ServiceStreak, 'kind' | 'count'> | null
  /** Days since adoption, the adoption day itself counting as the first. */
  daysTogether: number
  /** Hats opened up so far, not counting No hat. */
  hats: number
}

/** What the share card says about the pet and its User. */
export function petShareStats({
  adoptedOn,
  today,
  streak,
  showStreaks,
  unlocked,
}: {
  adoptedOn: string
  today: string
  streak: ServiceStreak
  showStreaks: boolean
  unlocked: ReadonlySet<string>
}): PetShareStats {
  const count = showStreaks ? shownStreak(streak) : 0
  const days = daysBetween(adoptedOn, today)
  let hats = 0
  for (const item of unlocked)
    if (item.startsWith('hat:') && item !== 'hat:none') hats++
  return {
    streak: count > 0 ? { kind: streak.kind, count } : null,
    daysTogether: Number.isFinite(days) ? Math.max(1, days + 1) : 1,
    hats,
  }
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
