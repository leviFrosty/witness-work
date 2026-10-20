import { usePreferences } from '@/stores/preferences'
import { syncTransport } from '@/lib/syncTransport'
import { registerCloudSyncCopy } from '@/lib/syncTransport/registry'
import type {
  SyncTransport,
  TransportSubscription,
} from '@/lib/syncTransport/types'

/**
 * Which sync option this device uses (ADR 0030): one at a time, never both.
 *
 * - `cloud`: Cloud Sync, the account's end-to-end encrypted slots on ww-api.
 * - `platform`: iCloud on iOS, Google Drive on Android.
 *
 * Whether sync runs at all is still `iCloudSyncEnabled`. Kept apart from
 * `@/lib/syncTransport`, which shared code imports without the stores.
 */
export type SyncProvider = 'cloud' | 'platform'

/** Cloud Sync's transport, registered by the app (`src/app/sync/cloudSync`). */
let cloudTransport: SyncTransport | null = null

export function registerCloudSyncTransport(transport: SyncTransport): void {
  cloudTransport = transport
  // A device on Cloud Sync keeps its choice, and the copy for it, while the
  // server's switch has it paused.
  registerCloudSyncCopy({
    offered: () => cloudSyncOffered() || usesCloudSync(),
    used: usesCloudSync,
  })
}

export const registeredCloudSyncTransport = (): SyncTransport | null =>
  cloudTransport

/**
 * Whether Cloud Sync is offered to this device as its default: registered, the
 * server's switch is on (`GET /app/v1/config`), and the entitlement could cover
 * it. Says nothing about whether the device is entitled yet.
 */
export function cloudSyncOffered(): boolean {
  if (!cloudTransport) return false
  return usePreferences.getState().cloudSyncConfig?.enabled === true
}

/**
 * The option this device's sync runs on. A device that chose has its choice.
 * One that never chose but already syncs through iCloud or Drive (from before
 * Cloud Sync) stays there. Otherwise Cloud Sync, while it's offered.
 */
export function syncProvider(): SyncProvider {
  const { syncProvider: chosen, iCloudSyncEnabled } = usePreferences.getState()
  if (chosen === 'cloud') return cloudTransport ? 'cloud' : 'platform'
  if (chosen === 'platform') return 'platform'
  if (iCloudSyncEnabled) return 'platform'
  return cloudSyncOffered() ? 'cloud' : 'platform'
}

/** Whether this device's sync runs on Cloud Sync. */
export const usesCloudSync = (): boolean => syncProvider() === 'cloud'

/**
 * The transport the sync engine reads and writes: Cloud Sync's, or this
 * platform's. Read on every call, so a switch takes effect at once. The account
 * file (ADR 0011) stays on `syncTransport()` whatever this is.
 */
export function activeSyncTransport(): SyncTransport {
  return usesCloudSync() && cloudTransport ? cloudTransport : syncTransport()
}

/** Each transport's listener, forwarding only while it's the active one. */
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

/** Remote changes on whichever transport is active when they fire. */
export const addActiveRemoteChangeListener = (
  listener: (event: { modifiedAt: number }) => void
) =>
  forwardActive(
    (transport, forward) => transport.addRemoteChangeListener(forward),
    listener
  )

/**
 * Availability of the active transport, and a switch between transports (which
 * makes another one active): the engine catches up on either.
 */
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
