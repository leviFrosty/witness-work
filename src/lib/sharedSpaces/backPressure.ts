import { SpaceError } from '@/lib/sharedSpaces/client'

/**
 * How long Shared Spaces asked to be left alone, as Buddies reads its relay
 * (docs/buddies-protocol.md, "Client behaviour"): the server's `Retry-After` on
 * `rate_limited` (a minute without one), and at least 15 minutes for the kill
 * switch (`disabled`) or a version the server no longer takes
 * (`upgrade_required`). A device that couldn't be verified waits as long as its
 * session does before attesting again. Automatic work (returning to the app,
 * the live signal, a local change) waits it out; the User's own pull to refresh
 * still goes.
 */

/** Rate limited with no Retry-After: automatic syncs wait this long. */
export const RATE_LIMIT_COOL_DOWN_MS = 60 * 1000
/**
 * The kill switch is on: automatic syncs wait at least this long, so the app
 * checks back now and then instead of polling a switched-off service.
 */
export const DISABLED_COOL_DOWN_MS = 15 * 60 * 1000

/** The wait a failed call asks for, or null when it asks for none. */
export function coolDownFor(error: unknown): number | null {
  if (!(error instanceof SpaceError)) return null
  switch (error.code) {
    case 'disabled':
    case 'upgrade_required':
      return Math.max(error.retryAfterMs ?? 0, DISABLED_COOL_DOWN_MS)
    case 'rate_limited':
      return error.retryAfterMs ?? RATE_LIMIT_COOL_DOWN_MS
    // Only the User freeing a spot helps; a suspended account still reads.
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
    /** Holds automatic work back as long as `error` asks. */
    note(error: unknown) {
      const wait = coolDownFor(error)
      if (wait !== null) until = Math.max(until, now() + wait)
    },
    /** The server asked to back off, and it isn't over. */
    coolingDown: () => now() < until,
    /** When automatic work may go again (epoch ms), 0 when it may now. */
    until: () => (now() < until ? until : 0),
    clear() {
      until = 0
    },
  }
}
