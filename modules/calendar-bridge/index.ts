import { Platform, requireOptionalNativeModule } from 'expo-modules-core'

export type CalendarDevice = { id: string; name: string; seen?: number }
export type PublishingState = {
  primary: string | null
  pending: string | null
  busy: string | null
  namespace: string
  devices: CalendarDevice[]

  publishedKeys: string[]

  configurationToken?: string

  includeDetails?: boolean
  defaultInclude?: boolean

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

  alertMinutes?: number
}
export type CalendarSnapshot = {
  title: string
  deletedContactIds: string[]
  entries: CalendarEntry[]

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

  removeAllMarkedEvents(): Promise<number>
}

export type AndroidCalendarEvent = {
  id: string

  syncId: string | null
  title: string
  start: number
  end: number
  location: string
  description: string
  allDay: boolean
}

export type AndroidEventWrite = {
  id?: string
  title: string
  start: number
  end: number
  location: string
  description: string
  alertMinutes?: number

  resetAlert: boolean
}

interface AndroidCalendarBridgeNative {
  requestAccess(): Promise<boolean>
  destinations(): Promise<CalendarDestination[]>

  createCalendar(title: string): Promise<CalendarDestination>
  events(calendarId: string): Promise<AndroidCalendarEvent[]>
  apply(
    calendarId: string,
    writes: AndroidEventWrite[],
    deletes: string[]
  ): Promise<void>
}

const native = requireOptionalNativeModule('CalendarBridge')

export const calendarBridgeAvailable = !!native

export const calendarSyncSupported =
  Platform.OS === 'ios' ||
  (Platform.OS === 'android' && calendarBridgeAvailable)

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

export function subscribeCalendarChanges(listener: () => void) {
  if (Platform.OS !== 'ios') return undefined
  return (native as CalendarBridgeNative | null)?.addListener(
    'onCalendarChange',
    listener
  )
}
