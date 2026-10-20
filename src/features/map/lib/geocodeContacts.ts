import type { Contact } from '@/types/contact'
import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'
import { mayApplyGeocode } from '@/lib/contactEdits'
import { fetchCoordinateFromAddress } from '@/lib/address'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import { classifyNetworkError } from '@/lib/http/networkError'
import { isDeviceOffline } from '@/lib/http/online'
import { countTruthyValueStrings } from '@/lib/objects'
import useContacts from '@/stores/contactsStore'

/**
 * Lookups in flight at once. With `fetchCoordinateFromAddress` honouring
 * Retry-After, this keeps a batch under ww-api's per-IP geocode limit.
 */
const GEOCODE_CONCURRENCY = 3

/**
 * `found`: the Contact got its pin. `notFound`: the lookup has no match for the
 * address. `failed`: the lookup failed and may work later. `changed`: the
 * Contact's address or pin changed while it was looked up, so the result was
 * dropped.
 */
export type GeocodeOutcome = 'found' | 'notFound' | 'failed' | 'changed'

/** Has an address to look up, and no pin yet. */
export const isMissingPin = (contact: Contact): boolean =>
  !!contact.address &&
  countTruthyValueStrings(contact.address) !== 0 &&
  !contact.coordinate &&
  !contact.userDraggedCoordinate

/**
 * Identifies a Contact's address for the Map's "Find contacts" row. A new or
 * edited address gets a new key, so a Contact skipped for one address is
 * offered again for the next. A hash, so storage never holds the address.
 */
export const pinLookupKey = (contact: Pick<Contact, 'id' | 'address'>) =>
  contentHash(canonicalJson({ id: contact.id, address: contact.address }))

/**
 * Active Contacts the Map can't show yet because their address was never looked
 * up (imports, restores, a skipped Map setup), minus those whose current
 * address `skipped` holds.
 */
export function contactsToFind(
  contacts: Contact[],
  skipped: ReadonlySet<string>
): Contact[] {
  return filterActivesContacts(contacts).filter(
    (contact) => isMissingPin(contact) && !skipped.has(pinLookupKey(contact))
  )
}

/** A count for analytics, in coarse buckets. */
export function countBucket(count: number): string {
  if (count <= 1) return String(Math.max(0, count))
  if (count <= 5) return '2-5'
  if (count <= 20) return '6-20'
  if (count <= 50) return '21-50'
  return '51+'
}

/**
 * Looks up each Contact's address and pins the ones it finds, a few at a time.
 * Never replaces a pin placed while it ran or an address edited meanwhile.
 * Aborting `controller` stops it; going offline aborts it too, since every
 * other lookup would fail the same way, and returns `wentOffline`.
 */
export async function geocodeContacts(
  contacts: Contact[],
  {
    controller,
    incrementGeocodeApiCallCount,
    onResult,
  }: {
    controller: AbortController
    incrementGeocodeApiCallCount: () => void
    onResult: (contact: Contact, outcome: GeocodeOutcome) => void
  }
): Promise<{ wentOffline: boolean }> {
  const queue = [...contacts]
  let wentOffline = false

  const worker = async () => {
    while (queue.length > 0) {
      if (controller.signal.aborted) break
      const contact = queue.shift()
      if (!contact) break
      try {
        const position = await fetchCoordinateFromAddress(
          incrementGeocodeApiCallCount,
          contact.address,
          controller.signal
        )
        if (controller.signal.aborted) break
        if (!position) {
          onResult(contact, 'notFound')
          continue
        }
        const { contacts: current, updateContact } = useContacts.getState()
        const latest = current.find((item) => item.id === contact.id)
        if (!mayApplyGeocode(contact, latest)) {
          onResult(contact, 'changed')
          continue
        }
        updateContact({ id: contact.id, coordinate: position })
        onResult(contact, 'found')
      } catch (error) {
        if (controller.signal.aborted) break
        if (isDeviceOffline(classifyNetworkError(error))) {
          wentOffline = true
          controller.abort()
          break
        }
        onResult(contact, 'failed')
      }
    }
  }

  await Promise.all(Array.from({ length: GEOCODE_CONCURRENCY }, worker))
  return { wentOffline }
}
