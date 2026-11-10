import type { MinuteDisplayFormat } from '@/types/timeEntry'

export const DURATION_STEP = 15

export const isExactInFormat = (
  minutes: number,
  format: MinuteDisplayFormat
): boolean => format !== 'decimal' || minutes % 6 === 0

export const DURATION_PRESETS = [30, 60, 90, 120, 180] as const

export const MAX_DURATION_HOURS = 99

const MAX_MINUTES = MAX_DURATION_HOURS * 60 + 59

export const stepDuration = (total: number, direction: 1 | -1): number => {
  const next =
    direction > 0
      ? (Math.floor(total / DURATION_STEP) + 1) * DURATION_STEP
      : (Math.ceil(total / DURATION_STEP) - 1) * DURATION_STEP
  return Math.min(MAX_MINUTES, Math.max(0, next))
}
