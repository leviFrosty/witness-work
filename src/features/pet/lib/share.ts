import { crop, scaleNearest, type PixelBuffer } from '@/lib/pixelArt'
import { shownStreak, type ServiceStreak } from '@/lib/serviceStreak'
import { composeScene, VIEW_CARD, type PlayerInput } from '@/features/pet/art'
import { daysBetween } from '@/features/pet/lib/dayKeys'

export const PET_SHARE_SCALE = 4

export function petShareImage(
  input: PlayerInput,
  scale = PET_SHARE_SCALE,
  showSign = false
): PixelBuffer {
  const room = showSign ? input.room : { ...input.room, sign: 'none' as const }
  const frame = composeScene({ ...input, room, particles: null }, 0)
  return scaleNearest(crop(frame, VIEW_CARD), scale)
}

export type PetShareStats = {
  streak: Pick<ServiceStreak, 'kind' | 'count'> | null

  daysTogether: number

  hats: number
}

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

export function petShareFileName(name: string, dayKey: string): string {
  const safe = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${safe || 'pet'}-${dayKey}.png`
}
