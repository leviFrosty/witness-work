import {
  EventSubscription,
  Platform,
  requireOptionalNativeModule,
} from 'expo-modules-core'

/** How a watch entry was made, reported to analytics. */
export type WatchOrigin = 'app' | 'shortcut' | 'timer'

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

/** Whether this binary can talk to an Apple Watch (iOS with the module). */
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
 * Stores the snapshot natively and sends it to the watch when one is paired
 * with the app installed. Throws if Swift can't decode it.
 */
export function setSnapshot(json: string): void {
  native?.setSnapshot(json)
}

/** Watch entries received but not yet saved, oldest first. */
export function getPendingEntries(): WatchEntryDraft[] {
  return native?.getPendingEntries() ?? []
}

/** Marks entries as handled (saved or refused) and tells the watch. */
export function resolveEntries(ids: string[]): void {
  if (ids.length) native?.resolveEntries(ids)
}

/** Returns and clears analytics events recorded by the native layer. */
export function takeEvents(): WatchEvent[] {
  return native?.takeEvents() ?? []
}

/** Fires when watch entries or events arrive while JS is running. */
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
