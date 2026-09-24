import * as Device from 'expo-device'
import {
  calendarBridge,
  type CalendarDestination,
  type PublishingState,
  type SharedCalendarOptions,
} from '../../../modules/calendar-bridge'
import { getOrCreate } from '../../../modules/keychain-uuid'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useSupporter } from '@/features/supporter/stores/supporter'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { buildCalendarSnapshot } from '@/app/calendar/snapshot'
import i18n from '@/lib/locales'
import { addressToString } from '@/lib/address'

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

export function calendarErrorKey(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : String(error)
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

/**
 * Serialize UI actions and auto-publishing; native serialization is the final
 * gate. Background runs don't disable the UI, and an error stays visible until
 * a later run succeeds.
 */
let queue: Promise<unknown> = Promise.resolve()
export function calendarAction<T>(
  action: () => Promise<T>,
  { background = false }: { background?: boolean } = {}
): Promise<T> {
  const next = queue
    .catch(() => undefined)
    .then(async () => {
      if (!background) useCalendarPublishing.setState({ working: true })
      try {
        const result = await action()
        useCalendarPublishing.setState({ error: null })
        return result
      } catch (error) {
        useCalendarPublishing.setState({ error: calendarErrorKey(error) })
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
  useCalendarSync.setState((settings) => ({
    sharedCalendar: title
      ? { title, account: state.calendarAccount ?? '' }
      : null,
    // Absent on records from older builds: keep this device's value.
    includeDetails: state.includeDetails ?? settings.includeDetails,
    defaultInclude: state.defaultInclude ?? settings.defaultInclude,
  }))
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
export async function setSharedOptions(options: SharedCalendarOptions) {
  const { id, name } = identity()
  const previous = useCalendarSync.getState()
  useCalendarSync.setState(options)
  try {
    applyState(await calendarBridge().configure(id, name, options))
  } catch (error) {
    useCalendarSync.setState({
      includeDetails: previous.includeDetails,
      defaultInclude: previous.defaultInclude,
    })
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
  const { id, name } = identity()
  const previous = useCalendarSync.getState()
  const switched =
    (!!previous.destination && previous.destination.id !== destination.id) ||
    (!!previous.sharedCalendar &&
      (previous.sharedCalendar.title !== destination.title ||
        previous.sharedCalendar.account !== destination.account))
  const state = await claimPrimary()
  applyState(
    await calendarBridge().setDestination(
      id,
      name,
      destination.title,
      destination.account
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
  await publishCalendar({ repair: fresh || switched })
}

export async function createCalendar(sourceId: string) {
  const { id, name } = identity()
  await claimPrimary()
  let destination: CalendarDestination
  try {
    destination = await calendarBridge().createCalendar(
      id,
      name,
      sourceId,
      i18n.t('calendarName')
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
 * After a handoff, the new primary reconnects to the same calendar by title and
 * account, but only if calendar access was already granted: this runs in the
 * background and must never prompt.
 */
export async function reconnectSharedCalendar() {
  const settings = useCalendarSync.getState()
  const shared = settings.sharedCalendar
  if (settings.enabled || settings.optedOut || !shared) return false
  // Throws without calendar access; the user reconnects from Settings.
  const calendars = await calendarBridge()
    .destinations()
    .catch(() => [])
  const matches = calendars.filter(
    (calendar) =>
      calendar.title === shared.title && calendar.account === shared.account
  )
  if (matches.length !== 1) return false
  await connectCalendar(matches[0])
  return true
}

/** Only the primary changes shared state; other devices just stop locally. */
export async function disconnectCalendar(remove: boolean) {
  const { id, name } = identity()
  const settings = useCalendarSync.getState()
  if (remove && settings.destination) {
    const state = await refreshPublishing()
    if (settings.namespace !== state.namespace)
      throw new Error('CALENDAR_ACCOUNT_CHANGED')
    await calendarBridge().removePublished(id, name, settings.destination.id)
    await refreshPublishing()
  } else if (useCalendarPublishing.getState().state?.primary === id) {
    // Best effort: keeping events must work offline too.
    await calendarBridge()
      .forgetDestination(id, name)
      .then(applyState)
      .catch(() => undefined)
  }
  useCalendarSync.setState({
    enabled: false,
    optedOut: true,
    lastSyncedAt: null,
  })
}

/**
 * `pull`: refresh app data first. Needed when publishing after launch or
 * foreground; local edits already reflect the merged data.
 */
export async function publishCalendar({
  repair = false,
  pull = true,
}: { repair?: boolean; pull?: boolean } = {}) {
  const settings = useCalendarSync.getState()
  if (!settings.enabled || !settings.destination) return
  const state = await refreshPublishing()
  const { id, name } = identity()
  if (state.primary !== id) return
  if (state.namespace !== settings.namespace)
    throw new Error('CALENDAR_ACCOUNT_CHANGED')
  // Wait for the complete merge before taking a snapshot. Calendar reads never
  // cause paid data sync to be enabled, or import personal calendar events.
  // Without Supporter, data sync is off, so there is nothing to wait for.
  if (
    pull &&
    usePreferences.getState().iCloudSyncEnabled &&
    useSupporter.getState().isSupporter
  )
    await iCloudSync.pullBeforeCalendarPublish()
  const contacts = useContacts.getState()
  const visits = useConversations.getState()
  await calendarBridge().publish(
    id,
    name,
    settings.destination.id,
    buildCalendarSnapshot({
      visits: visits.conversations,
      deletedVisits: visits.deletedConversations,
      contacts: contacts.contacts.map((contact) => ({
        ...contact,
        address: addressToString(contact.address),
      })),
      deletedContactIds: contacts.deletedContacts.map((contact) => contact.id),
      publishedKeys: state.publishedKeys,
      includeDetails: state.includeDetails ?? settings.includeDetails,
      title: i18n.t('calendarFollowUpTitle'),
    }),
    repair
  )
  useCalendarSync.setState({ lastSyncedAt: Date.now() })
}
