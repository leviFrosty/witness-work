import {
  EventSubscription,
  Platform,
  requireOptionalNativeModule,
} from 'expo-modules-core'

export type WatchOrigin =
  | 'app'
  | 'shortcut'
  | 'timer'
  | 'phoneShortcut'
  | 'tile'
  | 'ongoing_activity'

export type WatchEntryDraft = {
  id: string

  date: string
  hours: number
  minutes: number
  categoryId: string | null
  origin: WatchOrigin
}

export type WatchTripDraft = {
  id: string

  date: string

  vehicleId: string | null

  distanceMiles: number
  roundTrip: boolean
  origin: WatchOrigin
}

export type WatchStatus = {
  isSupported: boolean
  isPaired: boolean
  isWatchAppInstalled: boolean
  isComplicationEnabled: boolean

  activeComplications: string[] | null
}

export type WatchEvent = {
  name: string
  properties: Record<string, string>
}

type WatchBridgeNative = {
  getStatus(): WatchStatus

  setSnapshot(json: string, urgent?: boolean): void
  getPendingEntries(): WatchEntryDraft[]
  getPendingTrips(): WatchTripDraft[]
  resolveEntries(ids: string[]): void
  takeEvents(): WatchEvent[]

  takeErrors?(): string[]
  addListener(
    eventName: 'onInboxChange' | 'onStatusChange',
    listener: () => void
  ): EventSubscription
}

const native =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireOptionalNativeModule<WatchBridgeNative>('WatchBridge')
    : null

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
      activeComplications: null,
    }
  )
}

export function setSnapshot(
  json: string,
  { urgent }: { urgent: boolean }
): void {
  if (Platform.OS === 'android' && native?.takeErrors) {
    native.setSnapshot(json, urgent)
  } else {
    native?.setSnapshot(json)
  }
}

export function getPendingEntries(): WatchEntryDraft[] {
  return native?.getPendingEntries() ?? []
}

export function getPendingTrips(): WatchTripDraft[] {
  return native?.getPendingTrips() ?? []
}

export function resolveEntries(ids: string[]): void {
  if (ids.length) native?.resolveEntries(ids)
}

export function takeErrors(): string[] {
  return native?.takeErrors?.() ?? []
}

export function takeEvents(): WatchEvent[] {
  return native?.takeEvents() ?? []
}

export function onInboxChange(listener: () => void): EventSubscription {
  return native?.addListener('onInboxChange', listener) ?? { remove: () => {} }
}

export function onStatusChange(listener: () => void): EventSubscription {
  return native?.addListener('onStatusChange', listener) ?? { remove: () => {} }
}
