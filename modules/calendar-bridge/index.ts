import { requireOptionalNativeModule } from 'expo-modules-core'

/** `seen` is seconds since 1970; absent for devices registered by old builds. */
export type CalendarDevice = { id: string; name: string; seen?: number }
export type PublishingState = {
  primary: string | null
  pending: string | null
  busy: string | null
  namespace: string
  devices: CalendarDevice[]
  /** Follow-up keys with events in the connected calendar. */
  publishedKeys: string[]
  /** Reject snapshots built before the shared configuration changed. */
  configurationToken?: string
  /** Shared across devices; absent until first set. */
  includeDetails?: boolean
  defaultInclude?: boolean
  /** The connected calendar, so a new primary can find the same calendar. */
  calendarTitle?: string
  calendarAccount?: string
}
export type SharedCalendarOptions = {
  includeDetails?: boolean
  defaultInclude?: boolean
}
export type CalendarDestination = {
  id: string
  title: string
  account: string
}
export type CalendarSource = { id: string; title: string }
export type CalendarEntry = {
  key: string
  title: string
  start: number
  end: number
  url: string
  location: string
  /** The follow-up's in-app reminder, in minutes before `start`. */
  alertMinutes?: number
}
export type CalendarSnapshot = {
  /** Generic localized title, also used to redact events missing from app data. */
  title: string
  deletedContactIds: string[]
  entries: CalendarEntry[]
  /** Explicit removals only: absence from an incomplete device is not deletion. */
  removed: string[]
}

interface CalendarBridgeNative {
  addListener(
    event: 'onCalendarChange',
    listener: () => void
  ): { remove(): void }
  registerDevice(id: string, name: string): Promise<PublishingState>
  selectPrimary(
    id: string,
    name: string,
    primary: string
  ): Promise<PublishingState>
  removeDevice(
    id: string,
    name: string,
    target: string
  ): Promise<PublishingState>
  configure(
    id: string,
    name: string,
    options: SharedCalendarOptions
  ): Promise<PublishingState>
  setDestination(
    id: string,
    name: string,
    calendarId: string,
    title: string,
    account: string,
    resetManifest: boolean,
    expectedConfigurationToken: string
  ): Promise<PublishingState>
  forgetDestination(
    id: string,
    name: string,
    expectedConfigurationToken: string
  ): Promise<PublishingState>
  requestAccess(): Promise<boolean>
  destinations(): Promise<CalendarDestination[]>
  sources(): Promise<CalendarSource[]>
  createCalendar(
    id: string,
    name: string,
    sourceId: string,
    title: string,
    expectedConfigurationToken: string
  ): Promise<CalendarDestination>
  publish(
    id: string,
    name: string,
    calendarId: string,
    snapshot: CalendarSnapshot,
    repair: boolean,
    expectedConfigurationToken: string
  ): Promise<number>
  removePublished(
    id: string,
    name: string,
    calendarId: string,
    expectedConfigurationToken: string
  ): Promise<void>
}

const native =
  requireOptionalNativeModule<CalendarBridgeNative>('CalendarBridge')

/** False on binaries built before Calendar Sync; hide entry points there. */
export const calendarBridgeAvailable = !!native

/** Fail closed on older binaries; every native mutation checks cloud ownership. */
export function calendarBridge(): CalendarBridgeNative {
  if (!native) throw new Error('CALENDAR_BINARY_REQUIRED')
  return native
}

/** Changes in Calendar.app or its account replication also need reconciliation. */
export function subscribeCalendarChanges(listener: () => void) {
  return native?.addListener('onCalendarChange', listener)
}
