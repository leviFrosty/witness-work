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

const GEOCODE_CONCURRENCY = 3

export type GeocodeOutcome = 'found' | 'notFound' | 'failed' | 'changed'

export const isMissingPin = (contact: Contact): boolean =>
  !!contact.address &&
  countTruthyValueStrings(contact.address) !== 0 &&
  !contact.coordinate &&
  !contact.userDraggedCoordinate

export const pinLookupKey = (contact: Pick<Contact, 'id' | 'address'>) =>
  contentHash(canonicalJson({ id: contact.id, address: contact.address }))

export function contactsToFind(
  contacts: Contact[],
  skipped: ReadonlySet<string>
): Contact[] {
  return filterActivesContacts(contacts).filter(
    (contact) => isMissingPin(contact) && !skipped.has(pinLookupKey(contact))
  )
}

export function countBucket(count: number): string {
  if (count <= 1) return String(Math.max(0, count))
  if (count <= 5) return '2-5'
  if (count <= 20) return '6-20'
  if (count <= 50) return '21-50'
  return '51+'
}

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
