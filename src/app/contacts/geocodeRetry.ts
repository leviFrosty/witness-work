import { useEffect } from 'react'
import { fetchCoordinateFromAddress } from '@/lib/address'
import { addForegroundListener } from '@/lib/appLifecycle'
import { mayApplyGeocode } from '@/lib/contactEdits'
import {
  afterFailedGeocodeRetry,
  geocodeRetryStep,
  isRetryableGeocodeFailure,
} from '@/lib/geocodeRetry'
import { classifyNetworkError } from '@/lib/http/networkError'
import { addReconnectListener, isKnownOffline } from '@/lib/http/online'
import useContacts from '@/stores/contactsStore'
import { useGeocodeRetry } from '@/stores/geocodeRetry'
import { usePreferences } from '@/stores/preferences'

const findContact = (id: string) =>
  useContacts.getState().contacts.find((contact) => contact.id === id)

let running: Promise<void> | null = null

/**
 * Looks up the addresses of Contacts saved while the lookup failed (usually
 * offline at the door), so they get their pin on the Map, in Nearby and in
 * route planning. Each retry waits out its backoff, and is dropped once its
 * Contact is gone, gets a hand-placed pin, or changes address.
 */
export function retryFailedGeocodes(): Promise<void> {
  running ??= run().finally(() => {
    running = null
  })
  return running
}

async function run() {
  const queue = useGeocodeRetry.getState()
  if (queue.queue.length === 0 || isKnownOffline()) return
  const { dataProtectionMode, incrementGeocodeApiCallCount } =
    usePreferences.getState()
  // Data protection mode never sends householder addresses to the lookup.
  if (dataProtectionMode) {
    queue.clear()
    return
  }
  for (const entry of queue.queue) {
    const contact = findContact(entry.contactId)
    const step = geocodeRetryStep(entry, contact, Date.now())
    if (step === 'wait') continue
    if (step === 'drop' || !contact) {
      queue.settle(entry, null)
      continue
    }
    try {
      const position = await fetchCoordinateFromAddress(
        incrementGeocodeApiCallCount,
        contact.address
      )
      if (position && mayApplyGeocode(contact, findContact(contact.id))) {
        useContacts
          .getState()
          .updateContact({ id: contact.id, coordinate: position })
      }
      // Found, or HERE has no match for it: either way, done.
      queue.settle(entry, null)
    } catch (error) {
      const kind = classifyNetworkError(error)
      queue.settle(
        entry,
        isRetryableGeocodeFailure(kind)
          ? afterFailedGeocodeRetry(entry, Date.now())
          : null
      )
      // The rest would fail the same way.
      if (kind === 'offline') return
    }
  }
}

/** Retries failed address lookups at launch, on return, and on reconnect. */
export function useGeocodeRetries(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    const retry = () => void retryFailedGeocodes()
    const foreground = addForegroundListener(retry)
    const reconnect = addReconnectListener(retry)
    retry()
    return () => {
      foreground.remove()
      reconnect.remove()
    }
  }, [ready])
}
