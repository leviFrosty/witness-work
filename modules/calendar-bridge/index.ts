import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

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
  /** Android: stored only on this device. */
  local?: boolean
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
  /** Developer tools: every WitnessWork event in every calendar, any namespace. */
  removeAllMarkedEvents(): Promise<number>
}

/** A marked WitnessWork event read from CalendarContract. */
export type AndroidCalendarEvent = {
  id: string
  /** The provider's server id; null until the event first syncs. */
  syncId: string | null
  title: string
  start: number
  end: number
  location: string
  description: string
  allDay: boolean
}
/** Without `id`, inserts a new event. */
export type AndroidEventWrite = {
  id?: string
  title: string
  start: number
  end: number
  location: string
  description: string
  alertMinutes?: number
  /** Replace the event's reminders with `alertMinutes`. */
  resetAlert: boolean
}

/** Single device: no ownership protocol, so no device or token arguments. */
interface AndroidCalendarBridgeNative {
  requestAccess(): Promise<boolean>
  destinations(): Promise<CalendarDestination[]>
  /** A local calendar on this device; returns the existing one if present. */
  createCalendar(title: string): Promise<CalendarDestination>
  events(calendarId: string): Promise<AndroidCalendarEvent[]>
  apply(
    calendarId: string,
    writes: AndroidEventWrite[],
    deletes: string[]
  ): Promise<void>
}

const native = requireOptionalNativeModule('CalendarBridge')

/** False on binaries built before Calendar Sync; hide entry points there. */
export const calendarBridgeAvailable = !!native

/**
 * Older iOS binaries still show Calendar Sync and explain that they need an
 * update. Android shows it only on binaries with the module.
 */
export const calendarSyncSupported =
  Platform.OS === 'ios' ||
  (Platform.OS === 'android' && calendarBridgeAvailable)

/** Fail closed on older binaries; every native mutation checks cloud ownership. */
export function calendarBridge(): CalendarBridgeNative {
  if (!native || Platform.OS !== 'ios')
    throw new Error('CALENDAR_BINARY_REQUIRED')
  return native as CalendarBridgeNative
}

export function androidCalendarBridge(): AndroidCalendarBridgeNative {
  if (!native || Platform.OS !== 'android')
    throw new Error('CALENDAR_BINARY_REQUIRED')
  return native as AndroidCalendarBridgeNative
}

/** Changes in Calendar.app or its account replication also need reconciliation. */
export function subscribeCalendarChanges(listener: () => void) {
  if (Platform.OS !== 'ios') return undefined
  return (native as CalendarBridgeNative | null)?.addListener(
    'onCalendarChange',
    listener
  )
}
