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

      queue.settle(entry, null)
    } catch (error) {
      const kind = classifyNetworkError(error)
      queue.settle(
        entry,
        isRetryableGeocodeFailure(kind)
          ? afterFailedGeocodeRetry(entry, Date.now())
          : null
      )

      if (kind === 'offline') return
    }
  }
}

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
