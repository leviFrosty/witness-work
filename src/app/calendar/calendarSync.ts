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
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { perf } from '@/lib/perf'
import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'

/** IOS 16+ reports a generic "iPhone" without a special entitlement. */
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

/** The iOS messages mention iPhone Settings or iCloud. */
const ANDROID_ERROR_KEYS: Record<string, string> = {
  calendarPermissionError: 'calendarPermissionErrorAndroid',
  calendarConnectionError: 'calendarConnectionErrorAndroid',
}

export function calendarErrorKey(error: unknown) {
  const key = errorKey(calendarErrorCode(error))
  return (Platform.OS === 'android' && ANDROID_ERROR_KEYS[key]) || key
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
  if (code.includes('CALENDAR_DEVICE_IN_USE')) return 'calendarDeviceInUse'
  if (code.includes('CALENDAR_BINARY_REQUIRED')) return 'calendarBinaryError'
  if (code.includes('CALENDAR_ACCOUNT_CHANGED')) return 'calendarAccountChanged'
  if (code.includes('CALENDAR_INVALID_DATE')) return 'calendarDateError'
  return 'calendarConnectionError'
}

/** Rewrites the same calendar anyway after this long, as a backstop. */
const REPUBLISH_UNCHANGED_AFTER_MS = 6 * 60 * 60_000
/** What the last successful publish wrote; null to publish regardless. */
let lastPublished: { key: string; at: number } | null = null

/**
 * Serialize UI actions and auto-publishing; native serialization is the final
 * gate. Background runs don't disable the UI, and an error stays visible until
 * publishing succeeds or the user disconnects. `report: false` keeps checks on
 * a device that doesn't publish silent: its user never asked for updates.
 */
let queue: Promise<unknown> = Promise.resolve()
export function calendarAction<T>(
  action: () => Promise<T>,
  {
    background = false,
    report = true,
  }: { background?: boolean; report?: boolean } = {}
): Promise<T> {
  const next = queue
    .catch(() => undefined)
    .then(async () => {
      if (!background) useCalendarPublishing.setState({ working: true })
      try {
        return await action()
      } catch (error) {
        // The next publish goes through, so success clears the error shown.
        lastPublished = null
        if (!report) throw error
        const errorKey = calendarErrorKey(error)
        // Background retries repeat the same failure; count it once until it
        // changes or publishing works again.
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
          })
        throw error
      } finally {
        if (!background) useCalendarPublishing.setState({ working: false })
      }
    })
  queue = next
  return next
}

function applyState(state: PublishingState) {
  useCalendarPublishing.setState({ state })
  const title = state.calendarTitle
  useCalendarSync.setState({
    sharedCalendar: title
      ? { title, account: state.calendarAccount ?? '' }
      : null,
    // Absent until first set: details stay private.
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
  // Choosing this device is consent to publish from it again.
  if (primary === id) useCalendarSync.setState({ optedOut: false })
}

export async function removeDevice(target: string) {
  const { id, name } = identity()
  applyState(await calendarBridge().removeDevice(id, name, target))
}

/** Shared by all devices so switching primary never changes what's published. */
export async function setSharedOptions(
  options: Pick<SharedCalendarOptions, 'includeDetails'>
) {
  // A single device: nothing to share.
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

/** The first device to connect becomes primary; otherwise ownership is explicit. */
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
  return calendarBridge().destinations()
}

/**
 * `fresh`: the manifest from a previously connected calendar doesn't apply to a
 * calendar created just now, or to a different calendar the user switched to.
 * Waiting for replicated events only makes sense for the same calendar.
 */
export async function connectCalendar(
  destination: CalendarDestination,
  { fresh = false }: { fresh?: boolean } = {}
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
      fresh || switched,
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
  analytics.capture('calendar_connected', { created: fresh })
}

export async function calendarSources() {
  if (Platform.OS === 'android') return android.calendarSources()
  return calendarBridge().sources()
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
    // Some CalDAV accounts don't support creating calendars.
    if (calendarErrorKey(error) === 'calendarConnectionError')
      throw new Error('CALENDAR_CREATE_FAILED')
    throw error
  }
  await connectCalendar(destination, { fresh: true })
}

/**
 * One-tap setup for onboarding. Reuses the shared or an existing WitnessWork
 * calendar, otherwise creates one, preferring iCloud.
 */
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
    await connectCalendar(existing[0])
  } else {
    const sources = await calendarBridge().sources()
    const source =
      sources.find((candidate) => candidate.title === 'iCloud') ?? sources[0]
    if (!source) throw new Error('CALENDAR_CREATE_FAILED')
    await createCalendar(source.id)
  }
  return 'connected'
}

/** Resolve a shared destination without changing its manifest or prompting. */
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
  // The calendar this device publishes to is gone (deleted, or its account
  // turned off), as opposed to a shared one that hasn't synced here yet.
  if (!matches.length && settings.enabled) throw new Error('CALENDAR_MISSING')
  if (matches.length !== 1) throw new Error('CALENDAR_SHARED_NOT_FOUND')
  return matches[0]
}

/**
 * Resume on the new primary without replacing the previous publisher's
 * manifest.
 */
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

/** Only the primary changes shared state; other devices just stop locally. */
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
    // Best effort: keeping events must work offline too.
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

/**
 * A device that turned Calendar Sync off still checks in once, so an
 * interrupted batch it owns can finish (native refresh recovers it). After that
 * it stops: it no longer publishes, and a busy lock it held is released.
 */
export async function finishDisconnect() {
  const { id } = identity()
  const state = await refreshPublishing()
  if (state.busy !== id && state.pending !== id)
    useCalendarSync.setState({ registered: false })
}

/**
 * The calendar changed outside this app (Calendar.app, the account's sync), so
 * the next publish checks it even if the snapshot is unchanged.
 */
export function noteCalendarChanged() {
  lastPublished = null
}

/**
 * `pull`: refresh app data first. Needed when publishing after launch or
 * foreground; local edits already reflect the merged data.
 */
export async function publishCalendar({
  repair = false,
  pull = true,
}: { repair?: boolean; pull?: boolean } = {}) {
  // No ownership or app-data pull; missing events are simply recreated.
  if (Platform.OS === 'android') return android.publishCalendar()
  // One retry handles a concurrent option/destination change. Every attempt
  // rebuilds the snapshot from freshly checked shared configuration.
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
  // Before the primary check: a new iCloud account has its own record, where
  // this device isn't primary, and updates would otherwise stop silently.
  if (state.namespace !== settings.namespace)
    throw new Error('CALENDAR_ACCOUNT_CHANGED')
  if (state.primary !== id) return
  if (!state.calendarTitle) {
    // Another primary disconnected. A stale local connection must stay stopped.
    useCalendarSync.setState({ enabled: false, lastSyncedAt: null })
    return
  }
  const destination = await sharedDestination(state)
  if (destination.id !== settings.destination.id)
    useCalendarSync.setState({ destination, lastSyncedAt: null })
  // Calendar publishing stays available when paid data sync is inactive.
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
  // Past follow-ups are never backfilled, so only upcoming ones are counted.
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
