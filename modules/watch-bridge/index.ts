import {
  EventSubscription,
  Platform,
  requireOptionalNativeModule,
} from 'expo-modules-core'

/**
 * How an entry or trip was made, reported to analytics. `shortcut` is Siri or
 * Shortcuts on the watch; `phoneShortcut` is Siri or Shortcuts on the iPhone or
 * iPad (`targets/intents`).
 */
export type WatchOrigin = 'app' | 'shortcut' | 'timer' | 'phoneShortcut'

/** A Time Entry made on the Apple Watch, waiting to be saved. */
export type WatchEntryDraft = {
  /** Becomes the Time Entry id, so a repeated delivery is saved once. */
  id: string
  /** `YYYY-MM-DD` of the watch's local day when the entry was made. */
  date: string
  hours: number
  minutes: number
  categoryId: string | null
  origin: WatchOrigin
}

/** A mileage Trip made with Siri, waiting to be saved. */
export type WatchTripDraft = {
  /** Becomes the Trip id, so a repeated delivery is saved once. */
  id: string
  /** `YYYY-MM-DD` of the local day when the trip was logged. */
  date: string
  /** `null` uses the car a new trip would. */
  vehicleId: string | null
  /** Already doubled for a round trip. */
  distanceMiles: number
  roundTrip: boolean
  origin: WatchOrigin
}

export type WatchStatus = {
  isSupported: boolean
  isPaired: boolean
  isWatchAppInstalled: boolean
  isComplicationEnabled: boolean
}

export type WatchEvent = {
  name: string
  properties: Record<string, string>
}

type WatchBridgeNative = {
  getStatus(): WatchStatus
  setSnapshot(json: string): void
  getPendingEntries(): WatchEntryDraft[]
  getPendingTrips(): WatchTripDraft[]
  resolveEntries(ids: string[]): void
  takeEvents(): WatchEvent[]
  addListener(
    eventName: 'onInboxChange' | 'onStatusChange',
    listener: () => void
  ): EventSubscription
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<WatchBridgeNative>('WatchBridge')
    : null

/**
 * Whether this binary has the module (iOS): it talks to an Apple Watch and
 * receives what Siri made on this device.
 */
export function isAvailable(): boolean {
  return native != null
}

export function getStatus(): WatchStatus {
  return (
    native?.getStatus() ?? {
      isSupported: false,
      isPaired: false,
      isWatchAppInstalled: false,
      isComplicationEnabled: false,
    }
  )
}

/**
 * Stores the snapshot natively for Siri, and sends it to the watch when one is
 * paired with the app installed. Throws if Swift can't decode it.
 */
export function setSnapshot(json: string): void {
  native?.setSnapshot(json)
}

/** Entries from the watch or Siri not yet saved, oldest first. */
export function getPendingEntries(): WatchEntryDraft[] {
  return native?.getPendingEntries() ?? []
}

/** Trips from Siri not yet saved, oldest first. */
export function getPendingTrips(): WatchTripDraft[] {
  return native?.getPendingTrips() ?? []
}

/** Marks entries and trips as handled (saved or refused) and tells the watch. */
export function resolveEntries(ids: string[]): void {
  if (ids.length) native?.resolveEntries(ids)
}

/** Returns and clears analytics events recorded by the native layer. */
export function takeEvents(): WatchEvent[] {
  return native?.takeEvents() ?? []
}

/** Fires when entries, trips or events arrive while JS is running. */
export function onInboxChange(listener: () => void): EventSubscription {
  return native?.addListener('onInboxChange', listener) ?? { remove: () => {} }
}

/**
 * Fires when the connection activates or the paired watch, its app, or its
 * complications change.
 */
export function onStatusChange(listener: () => void): EventSubscription {
  return native?.addListener('onStatusChange', listener) ?? { remove: () => {} }
}
