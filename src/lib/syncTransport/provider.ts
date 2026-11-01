import { usePreferences } from '@/stores/preferences'
import { syncTransport } from '@/lib/syncTransport'
import { registerCloudSyncCopy } from '@/lib/syncTransport/registry'
import type {
  SyncTransport,
  TransportSubscription,
} from '@/lib/syncTransport/types'

export type SyncProvider = 'cloud' | 'platform'

let cloudTransport: SyncTransport | null = null

export function registerCloudSyncTransport(transport: SyncTransport): void {
  cloudTransport = transport

  registerCloudSyncCopy({
    offered: () => cloudSyncOffered() || usesCloudSync(),
    used: usesCloudSync,
  })
}

export const registeredCloudSyncTransport = (): SyncTransport | null =>
  cloudTransport

export function cloudSyncOffered(): boolean {
  if (!cloudTransport) return false
  return usePreferences.getState().cloudSyncConfig?.enabled === true
}

export function syncProvider(): SyncProvider {
  const { syncProvider: chosen, iCloudSyncEnabled } = usePreferences.getState()
  if (chosen === 'cloud') return cloudTransport ? 'cloud' : 'platform'
  if (chosen === 'platform') return 'platform'
  if (iCloudSyncEnabled) return 'platform'
  return cloudSyncOffered() ? 'cloud' : 'platform'
}

export const usesCloudSync = (): boolean => syncProvider() === 'cloud'

export function activeSyncTransport(): SyncTransport {
  return usesCloudSync() && cloudTransport ? cloudTransport : syncTransport()
}

function forwardActive<E>(
  subscribe: (
    transport: SyncTransport,
    listener: (event: E) => void
  ) => TransportSubscription,
  listener: (event: E) => void
): TransportSubscription {
  const transports = [syncTransport(), cloudTransport].filter(
    (transport): transport is SyncTransport => transport !== null
  )
  const subs = transports.map((transport) =>
    subscribe(transport, (event) => {
      if (activeSyncTransport() === transport) listener(event)
    })
  )
  return { remove: () => subs.forEach((sub) => sub.remove()) }
}

export const addActiveRemoteChangeListener = (
  listener: (event: { modifiedAt: number }) => void
) =>
  forwardActive(
    (transport, forward) => transport.addRemoteChangeListener(forward),
    listener
  )

export function addActiveAvailabilityListener(
  listener: (event: { available: boolean }) => void
): TransportSubscription {
  const forwarded = forwardActive(
    (transport, forward) => transport.addAvailabilityChangeListener(forward),
    listener
  )
  let active = activeSyncTransport()
  const unsubscribe = usePreferences.subscribe(() => {
    const next = activeSyncTransport()
    if (next === active) return
    active = next
    listener({ available: next.isAvailable() })
  })
  return {
    remove: () => {
      forwarded.remove()
      unsubscribe()
    },
  }
}
