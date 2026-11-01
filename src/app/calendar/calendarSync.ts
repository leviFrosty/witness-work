import { Platform } from 'react-native'
import * as Device from 'expo-device'
import {
  calendarBridge,
  type CalendarDestination,
  type PublishingState,
  type SharedCalendarOptions,
} from '../../../modules/calendar-bridge'
import { getOrCreate } from '../../../modules/keychain-uuid'
import { usePreferences } from '@/stores/preferences'
import { useSupporter } from '@/features/supporter/stores/supporter'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { currentCalendarSnapshot } from '@/app/calendar/currentSnapshot'
import * as android from '@/app/calendar/calendarSyncAndroid'
import {
  type CalendarRecovery,
  recoveryProperties,
  setRecoveryAttempt,
} from '@/app/calendar/calendarRecovery'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { perf } from '@/lib/perf'
import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'

const GENERIC_DEVICE_NAMES = ['iPhone', 'iPad', 'iPod touch']

export function deviceLabel() {
  const name = Device.deviceName
  if (name && !GENERIC_DEVICE_NAMES.includes(name)) return name
  return Device.modelName ?? name ?? i18n.t('iCloudThisDevice')
}

function identity() {
  const id = getOrCreate()
  if (!id) throw new Error('CALENDAR_BINARY_REQUIRED')
  useCalendarPublishing.setState({ deviceId: id })
  return { id, name: deviceLabel() }
}

function calendarErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : String(error)
}

const ANDROID_ERROR_KEYS: Record<string, string> = {
  calendarPermissionError: 'calendarPermissionErrorAndroid',
  calendarConnectionError: 'calendarConnectionErrorAndroid',
}

export function calendarErrorKey(error: unknown) {
  const key = errorKey(calendarErrorCode(error))
  return (Platform.OS === 'android' && ANDROID_ERROR_KEYS[key]) || key
}

const NATIVE_CODES = [
  'CALENDAR_UNAVAILABLE',
  'CALENDAR_BUSY',
  'CALENDAR_JOURNAL',
  'CALENDAR_DEVICE_UNKNOWN',
  'CALENDAR_STATE_CHANGED',
  'CALENDAR_INVALID_URL',
  'CALENDAR_CREATE_FAILED',
]
const GENERIC_ERROR_KEYS = [
  'calendarConnectionError',
  'calendarConnectionErrorAndroid',
  'calendarCreateError',
]

export function calendarNativeCode(error: unknown) {
  const cause =
    error instanceof Error && error.cause !== undefined ? error.cause : error
  const code = calendarErrorCode(cause)
  return NATIVE_CODES.find((known) => code.includes(known)) ?? 'other'
}

function errorKey(code: string) {
  if (code.includes('CALENDAR_STATE_CHANGED')) return 'calendarConnectionError'
  if (code.includes('CALENDAR_PERMISSION')) return 'calendarPermissionError'
  if (code.includes('CALENDAR_NOT_PRIMARY')) return 'calendarPrimaryRequired'
  if (code.includes('CALENDAR_MISSING')) return 'calendarMissingError'
  if (code.includes('CALENDAR_SHARED_NOT_FOUND'))
    return 'calendarSharedNotFound'
  if (code.includes('CALENDAR_EVENT_MOVED')) return 'calendarMovedError'
  if (code.includes('CALENDAR_WAITING_FOR_EVENTS'))
    return 'calendarWaitingForEvents'
  if (code.includes('CALENDAR_CHOOSE_EXISTING')) return 'calendarChooseExisting'
  if (code.includes('CALENDAR_CREATE_FAILED')) return 'calendarCreateError'
  if (code.includes('CALENDAR_NO_SOURCE')) return 'calendarNoSourceError'
  if (code.includes('CALENDAR_DEVICE_IN_USE')) return 'calendarDeviceInUse'
  if (code.includes('CALENDAR_BINARY_REQUIRED')) return 'calendarBinaryError'
  if (code.includes('CALENDAR_ACCOUNT_CHANGED')) return 'calendarAccountChanged'
  if (code.includes('CALENDAR_INVALID_DATE')) return 'calendarDateError'
  return 'calendarConnectionError'
}

const REPUBLISH_UNCHANGED_AFTER_MS = 6 * 60 * 60_000

let lastPublished: { key: string; at: number } | null = null

let retryable: (() => Promise<unknown>) | null = null

let queue: Promise<unknown> = Promise.resolve()
export function calendarAction<T>(
  action: () => Promise<T>,
  {
    background = false,
    report = true,
    recovery,
  }: {
    background?: boolean
    report?: boolean
    recovery?: CalendarRecovery
  } = {}
): Promise<T> {
  const next = queue
    .catch(() => undefined)
    .then(async () => {
      if (!background) useCalendarPublishing.setState({ working: true })
      setRecoveryAttempt(recovery ?? null)
      try {
        const result = await action()
        if (!useCalendarPublishing.getState().error) retryable = null
        return result
      } catch (error) {
        lastPublished = null
        if (!report) throw error

        retryable = background ? null : action
        const errorKey = calendarErrorKey(error)

        const repeated =
          background && useCalendarPublishing.getState().error === errorKey
        useCalendarPublishing.setState({ error: errorKey })
        const settings = useCalendarSync.getState()
        if (settings.enabled && !settings.failingSince)
          useCalendarSync.setState({ failingSince: Date.now() })
        if (!repeated)
          analytics.capture('calendar_sync_failed', {
            error_key: errorKey,
            background,
            ...(GENERIC_ERROR_KEYS.includes(errorKey) && {
              native_code: calendarNativeCode(error),
            }),
            ...recoveryProperties(),
          })
        throw error
      } finally {
        setRecoveryAttempt(null)
        if (!background) useCalendarPublishing.setState({ working: false })
      }
    })
  queue = next
  return next
}

export function retryCalendarAction(recovery: CalendarRecovery) {
  const action =
    retryable ??
    (useCalendarSync.getState().enabled ? () => publishCalendar() : null)
  if (!action) {
    useCalendarPublishing.setState({ error: null })
    return Promise.resolve()
  }
  return calendarAction(action, { recovery })
}

function applyState(state: PublishingState) {
  useCalendarPublishing.setState({ state })
  const title = state.calendarTitle
  useCalendarSync.setState({
    sharedCalendar: title
      ? { title, account: state.calendarAccount ?? '' }
      : null,

    includeDetails: state.includeDetails ?? false,
  })
  return state
}

export async function refreshPublishing(): Promise<PublishingState> {
  const { id, name } = identity()
  return applyState(await calendarBridge().registerDevice(id, name))
}

export async function selectPrimary(primary: string) {
  const { id, name } = identity()
  applyState(await calendarBridge().selectPrimary(id, name, primary))

  if (primary === id) useCalendarSync.setState({ optedOut: false })
}

export async function removeDevice(target: string) {
  const { id, name } = identity()
  applyState(await calendarBridge().removeDevice(id, name, target))
}

export async function setSharedOptions(
  options: Pick<SharedCalendarOptions, 'includeDetails'>
) {
  if (Platform.OS === 'android') return useCalendarSync.setState(options)
  const { id, name } = identity()
  const previous = useCalendarSync.getState()
  useCalendarSync.setState(options)
  try {
    applyState(await calendarBridge().configure(id, name, options))
  } catch (error) {
    useCalendarSync.setState({ includeDetails: previous.includeDetails })
    throw error
  }
}

async function claimPrimary() {
  const { id } = identity()
  let state = await refreshPublishing()
  if (!state.primary) {
    await selectPrimary(id)
    state = useCalendarPublishing.getState().state ?? state
  }
  if (state.primary !== id) throw new Error('CALENDAR_NOT_PRIMARY')
  return state
}

export async function calendarDestinations() {
  if (Platform.OS === 'android') return android.calendarDestinations()
  if (!(await calendarBridge().requestAccess()))
    throw new Error('CALENDAR_PERMISSION')
  const calendars = await calendarBridge().destinations()

  if (useCalendarPublishing.getState().error === 'calendarPermissionError')
    useCalendarPublishing.setState({ error: null })
  return calendars
}

export async function connectCalendar(
  destination: CalendarDestination,
  {
    fresh = false,
    rebuild = false,
  }: { fresh?: boolean; rebuild?: boolean } = {}
) {
  if (Platform.OS === 'android')
    return android.connectCalendar(destination, { fresh })
  const { id, name } = identity()
  const previous = useCalendarSync.getState()
  const state = await claimPrimary()
  const switched = state.calendarTitle
    ? state.calendarTitle !== destination.title ||
      state.calendarAccount !== destination.account
    : !!previous.destination && previous.destination.id !== destination.id
  applyState(
    await calendarBridge().setDestination(
      id,
      name,
      destination.id,
      destination.title,
      destination.account,
      fresh || rebuild || switched,
      state.configurationToken ?? state.namespace
    )
  )
  useCalendarSync.setState({
    destination,
    namespace: state.namespace,
    enabled: true,
    registered: true,
    optedOut: false,
    lastSyncedAt: null,
  })
  await publishCalendar()
  analytics.capture('calendar_connected', {
    created: fresh,
    ...recoveryProperties(),
  })
}

export async function calendarSources() {
  if (Platform.OS === 'android') return android.calendarSources()
  return calendarBridge().sources()
}

export async function calendarChoices() {
  const destinations = await calendarDestinations()
  const sources = await calendarSources()
  if (!destinations.length && !sources.length)
    throw new Error('CALENDAR_NO_SOURCE')

  if (useCalendarPublishing.getState().error === 'calendarNoSourceError')
    useCalendarPublishing.setState({ error: null })
  return { destinations, sources }
}

export async function createCalendar(sourceId: string) {
  if (Platform.OS === 'android') return android.createCalendar()
  const { id, name } = identity()
  const state = await claimPrimary()
  let destination: CalendarDestination
  try {
    destination = await calendarBridge().createCalendar(
      id,
      name,
      sourceId,
      i18n.t('calendarName'),
      state.configurationToken ?? state.namespace
    )
  } catch (error) {
    if (calendarErrorKey(error) === 'calendarConnectionError')
      throw Object.assign(new Error('CALENDAR_CREATE_FAILED'), { cause: error })
    throw error
  }
  await connectCalendar(destination, { fresh: true })
}

export async function quickConnectCalendar(): Promise<
  'connected' | 'elsewhere'
> {
  if (Platform.OS === 'android') return android.quickConnectCalendar()
  const { id } = identity()
  const state = await refreshPublishing()
  if (state.primary && state.primary !== id && state.calendarTitle)
    return 'elsewhere'
  const calendars = await calendarDestinations()
  const title = state.calendarTitle ?? i18n.t('calendarName')
  const existing = calendars.filter(
    (calendar) =>
      calendar.title === title &&
      (!state.calendarAccount || calendar.account === state.calendarAccount)
  )
  if (existing.length > 1) throw new Error('CALENDAR_CHOOSE_EXISTING')
  if (existing.length === 1) {
    await connectCalendar(existing[0], { rebuild: true })
  } else {
    const sources = await calendarBridge().sources()
    const source =
      sources.find((candidate) => candidate.title === 'iCloud') ?? sources[0]

    if (!source) throw new Error('CALENDAR_NO_SOURCE')
    await createCalendar(source.id)
  }
  return 'connected'
}

async function sharedDestination(state: PublishingState) {
  const settings = useCalendarSync.getState()
  const calendars = await calendarBridge().destinations()
  const destination = calendars.find(
    (calendar) => calendar.id === settings.destination?.id
  )
  if (
    destination &&
    destination.title === state.calendarTitle &&
    destination?.account === state.calendarAccount
  )
    return destination
  const matches = calendars.filter(
    (calendar) =>
      calendar.title === state.calendarTitle &&
      calendar.account === state.calendarAccount
  )

  if (!matches.length && settings.enabled) throw new Error('CALENDAR_MISSING')
  if (matches.length !== 1) throw new Error('CALENDAR_SHARED_NOT_FOUND')
  return matches[0]
}

export async function reconnectSharedCalendar() {
  const settings = useCalendarSync.getState()
  if (settings.enabled || settings.optedOut || !settings.sharedCalendar)
    return false
  const state = useCalendarPublishing.getState().state
  if (!state || state.primary !== identity().id) return false
  const destination = await sharedDestination(state)
  useCalendarSync.setState({
    destination,
    namespace: state.namespace,
    enabled: true,
    registered: true,
  })
  await publishCalendar()
  return true
}

export async function disconnectCalendar(
  remove: boolean,
  source: 'settings' | 'tray' | 'onboarding' | 'tools' = 'settings'
) {
  if (Platform.OS === 'android')
    return android.disconnectCalendar(remove, source)
  const { id, name } = identity()
  const settings = useCalendarSync.getState()
  if (remove && settings.destination) {
    const state = await refreshPublishing()
    if (settings.namespace !== state.namespace)
      throw new Error('CALENDAR_ACCOUNT_CHANGED')
    await calendarBridge().removePublished(
      id,
      name,
      settings.destination.id,
      state.configurationToken ?? state.namespace
    )
    await refreshPublishing()
  } else if (useCalendarPublishing.getState().state?.primary === id) {
    await calendarBridge()
      .forgetDestination(
        id,
        name,
        useCalendarPublishing.getState().state?.configurationToken ??
          settings.namespace ??
          ''
      )
      .then(applyState)
      .catch(() => undefined)
  }
  useCalendarSync.setState({
    enabled: false,
    optedOut: true,
    lastSyncedAt: null,
    failingSince: null,
  })
  useCalendarPublishing.setState({ error: null })
  analytics.capture('calendar_disconnected', { removed_events: remove, source })
}

export async function finishDisconnect() {
  const { id } = identity()
  const state = await refreshPublishing()
  if (state.busy !== id && state.pending !== id)
    useCalendarSync.setState({ registered: false })
}

export function noteCalendarChanged() {
  lastPublished = null
}

export async function publishCalendar({
  repair = false,
  pull = true,
}: { repair?: boolean; pull?: boolean } = {}) {
  if (Platform.OS === 'android') return android.publishCalendar()

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await publishCurrentCalendar({ repair, pull: pull && attempt === 0 })
      return
    } catch (error) {
      if (
        attempt ||
        !calendarErrorCode(error).includes('CALENDAR_STATE_CHANGED')
      )
        throw error
    }
  }
}

async function publishCurrentCalendar({
  repair,
  pull,
}: {
  repair: boolean
  pull: boolean
}) {
  const settings = useCalendarSync.getState()
  if (!settings.enabled || !settings.destination) return
  const state = await refreshPublishing()
  const { id, name } = identity()

  if (state.namespace !== settings.namespace)
    throw new Error('CALENDAR_ACCOUNT_CHANGED')
  if (state.primary !== id) return
  if (!state.calendarTitle) {
    useCalendarSync.setState({ enabled: false, lastSyncedAt: null })
    return
  }
  const destination = await sharedDestination(state)
  if (destination.id !== settings.destination.id)
    useCalendarSync.setState({ destination, lastSyncedAt: null })

  if (
    pull &&
    usePreferences.getState().iCloudSyncEnabled &&
    useSupporter.getState().isSupporter
  )
    await iCloudSync.pullBeforeCalendarPublish()
  const snapshot = currentCalendarSnapshot({
    publishedKeys: state.publishedKeys,
    includeDetails: state.includeDetails ?? false,
  })
  const token = state.configurationToken ?? state.namespace
  const key = contentHash(
    canonicalJson([snapshot, state.publishedKeys, destination.id, token])
  )
  const now = Date.now()

  const upcomingCount = snapshot.entries.filter(
    (entry) => entry.start >= now
  ).length
  if (
    !repair &&
    lastPublished?.key === key &&
    now - lastPublished.at < REPUBLISH_UNCHANGED_AFTER_MS
  ) {
    perf.count('calendar:skip')
    if (useCalendarSync.getState().upcomingCount !== upcomingCount)
      useCalendarSync.setState({ upcomingCount })
    return
  }
  lastPublished = null
  await calendarBridge().publish(
    id,
    name,
    destination.id,
    snapshot,
    repair,
    token
  )
  lastPublished = { key, at: now }
  useCalendarSync.setState({
    lastSyncedAt: now,
    upcomingCount,
    failingSince: null,
  })
  useCalendarPublishing.setState({ error: null })
}
