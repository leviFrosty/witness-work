import type { Contact } from '@/types/contact'
import type { NetworkErrorKind } from '@/lib/http/networkError'
import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'
import { countTruthyValueStrings } from '@/lib/objects'

/**
 * A Contact whose address couldn't be looked up when it was saved (offline,
 * timed out, or the service was down), to look up again later.
 */
export type GeocodeRetry = {
  contactId: string
  /**
   * Hash of the address and pin the Contact had when the lookup failed. Any
   * change to either (an edited address, a pin from another device) makes the
   * retry stale. A hash, so the queue never holds the address itself.
   */
  key: string
  /** Retries that have failed so far. */
  attempts: number
  /** Epoch ms; the next retry waits until then. */
  notBefore: number
}

/** Retries before giving up; with the delays below, about a day of tries. */
export const GEOCODE_RETRY_MAX_ATTEMPTS = 8
const FIRST_DELAY_MS = 2 * 60_000
const MAX_DELAY_MS = 6 * 60 * 60_000

export function geocodeRetryKey(
  contact: Pick<Contact, 'address' | 'coordinate'>
): string {
  return contentHash(
    canonicalJson({ address: contact.address, coordinate: contact.coordinate })
  )
}

/** Failures where the same lookup can succeed later. */
export function isRetryableGeocodeFailure(kind: NetworkErrorKind): boolean {
  return (
    kind === 'offline' ||
    kind === 'timeout' ||
    kind === 'rateLimited' ||
    kind === 'server'
  )
}

/** `queue` with `contact` due for a retry, replacing any earlier one for it. */
export function withGeocodeRetry(
  queue: GeocodeRetry[],
  contact: Pick<Contact, 'id' | 'address' | 'coordinate'>
): GeocodeRetry[] {
  return [
    ...queue.filter((entry) => entry.contactId !== contact.id),
    {
      contactId: contact.id,
      key: geocodeRetryKey(contact),
      attempts: 0,
      notBefore: 0,
    },
  ]
}

/**
 * What to do with `entry` now. A retry is dropped once its Contact is gone, has
 * a pin the user placed by hand, or no longer has the address and pin it failed
 * with.
 */
export function geocodeRetryStep(
  entry: GeocodeRetry,
  contact: Contact | undefined,
  now: number
): 'drop' | 'wait' | 'try' {
  if (
    !contact ||
    contact.userDraggedCoordinate ||
    !contact.address ||
    countTruthyValueStrings(contact.address) === 0 ||
    geocodeRetryKey(contact) !== entry.key
  ) {
    return 'drop'
  }
  return now < entry.notBefore ? 'wait' : 'try'
}

/**
 * `entry` after another failed retry, backing off 2, 8, 32 and 128 minutes,
 * then 6 hours; null once it has used up its retries.
 */
export function afterFailedGeocodeRetry(
  entry: GeocodeRetry,
  now: number
): GeocodeRetry | null {
  const attempts = entry.attempts + 1
  if (attempts >= GEOCODE_RETRY_MAX_ATTEMPTS) return null
  return {
    ...entry,
    attempts,
    notBefore:
      now + Math.min(FIRST_DELAY_MS * 4 ** (attempts - 1), MAX_DELAY_MS),
  }
}
