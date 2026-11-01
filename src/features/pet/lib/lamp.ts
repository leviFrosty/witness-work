import { MAX_HEARTS } from '@/features/pet/lib/life'

export type LampLevel = 0 | 1 | 2 | 3 | 4 | 5

export function lampLevel(life: { hearts: number; dead: boolean }): LampLevel {
  if (life.dead || !Number.isFinite(life.hearts)) return 0
  return Math.max(0, Math.min(MAX_HEARTS, Math.floor(life.hearts))) as LampLevel
}
