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
}
export type CalendarSnapshot = {
  entries: CalendarEntry[]
  /** Explicit removals only: absence from an incomplete device is not deletion. */
  removed: string[]
}

interface CalendarBridgeNative {
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
    title: string,
    account: string
  ): Promise<PublishingState>
  forgetDestination(id: string, name: string): Promise<PublishingState>
  requestAccess(): Promise<boolean>
  destinations(): Promise<CalendarDestination[]>
  sources(): Promise<CalendarSource[]>
  createCalendar(
    id: string,
    name: string,
    sourceId: string,
    title: string
  ): Promise<CalendarDestination>
  publish(
    id: string,
    name: string,
    calendarId: string,
    snapshot: CalendarSnapshot,
    repair: boolean
  ): Promise<number>
  removePublished(id: string, name: string, calendarId: string): Promise<void>
}

const native =
  requireOptionalNativeModule<CalendarBridgeNative>('CalendarBridge')

/** Fail closed on older binaries; every native mutation checks cloud ownership. */
export function calendarBridge(): CalendarBridgeNative {
  if (!native) throw new Error('CALENDAR_BINARY_REQUIRED')
  return native
}
