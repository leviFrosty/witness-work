import type { Contact } from '@/types/contact'
import type { NetworkErrorKind } from '@/lib/http/networkError'
import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'
import { countTruthyValueStrings } from '@/lib/objects'

export type GeocodeRetry = {
  contactId: string

  key: string

  attempts: number

  notBefore: number
}

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

export function isRetryableGeocodeFailure(kind: NetworkErrorKind): boolean {
  return (
    kind === 'offline' ||
    kind === 'timeout' ||
    kind === 'rateLimited' ||
    kind === 'server'
  )
}

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
