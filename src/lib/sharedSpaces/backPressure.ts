import { SpaceError } from '@/lib/sharedSpaces/client'

export const RATE_LIMIT_COOL_DOWN_MS = 60 * 1000

export const DISABLED_COOL_DOWN_MS = 15 * 60 * 1000

export function coolDownFor(error: unknown): number | null {
  if (!(error instanceof SpaceError)) return null
  switch (error.code) {
    case 'disabled':
    case 'upgrade_required':
      return Math.max(error.retryAfterMs ?? 0, DISABLED_COOL_DOWN_MS)
    case 'rate_limited':
      return error.retryAfterMs ?? RATE_LIMIT_COOL_DOWN_MS

    case 'limit':
    case 'suspended':
      return null
    default:
      return error.retryAfterMs
  }
}

export type BackPressure = ReturnType<typeof createBackPressure>

export function createBackPressure(now: () => number) {
  let until = 0
  return {
    note(error: unknown) {
      const wait = coolDownFor(error)
      if (wait !== null) until = Math.max(until, now() + wait)
    },

    coolingDown: () => now() < until,

    until: () => (now() < until ? until : 0),
    clear() {
      until = 0
    },
  }
}
