import {
  androidCalendarBridge,
  type CalendarDestination,
  type CalendarSource,
} from '../../../modules/calendar-bridge'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { currentCalendarSnapshot } from '@/app/calendar/currentSnapshot'
import {
  parseEventMarker,
  planAndroidPublish,
} from '@/app/calendar/androidEvents'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { recoveryProperties } from '@/app/calendar/calendarRecovery'

const LOCAL_SOURCE = 'local'

function labeled(destination: CalendarDestination): CalendarDestination {
  return destination.local
    ? { ...destination, account: i18n.t('calendarThisDeviceAndroid') }
    : destination
}

export async function calendarDestinations() {
  const bridge = androidCalendarBridge()
  if (!(await bridge.requestAccess())) throw new Error('CALENDAR_PERMISSION')
  const calendars = (await bridge.destinations()).map(labeled)

  if (
    useCalendarPublishing.getState().error === 'calendarPermissionErrorAndroid'
  )
    useCalendarPublishing.setState({ error: null })
  return calendars
}

export function calendarSources(): CalendarSource[] {
  return [{ id: LOCAL_SOURCE, title: i18n.t('calendarThisDeviceAndroid') }]
}

export async function connectCalendar(
  destination: CalendarDestination,
  { fresh = false }: { fresh?: boolean } = {}
) {
  useCalendarSync.setState({
    destination,
    enabled: true,
    optedOut: false,
    lastSyncedAt: null,
    failingSince: null,
  })
  await publishCalendar()

  analytics.capture('calendar_connected', {
    created: fresh,
    local_calendar: !!destination.local,
    ...recoveryProperties(),
  })
}

export async function createCalendar() {
  const destination = await androidCalendarBridge().createCalendar(
    i18n.t('calendarName')
  )
  await connectCalendar(labeled(destination), { fresh: true })
}

export async function quickConnectCalendar(): Promise<'connected'> {
  const calendars = await calendarDestinations()
  const existing = calendars.filter(
    (calendar) => calendar.title === i18n.t('calendarName')
  )
  if (existing.length > 1) throw new Error('CALENDAR_CHOOSE_EXISTING')
  if (existing.length === 1) await connectCalendar(existing[0])
  else await createCalendar()
  return 'connected'
}

export async function disconnectCalendar(
  remove: boolean,
  source: 'settings' | 'tray' | 'onboarding' | 'tools'
) {
  const { destination } = useCalendarSync.getState()
  if (remove && destination) {
    const bridge = androidCalendarBridge()
    const events = await bridge.events(destination.id)
    const marked = events
      .filter((event) => parseEventMarker(event.description))
      .map((event) => event.id)
    if (marked.length) await bridge.apply(destination.id, [], marked)
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

export async function publishCalendar() {
  const settings = useCalendarSync.getState()
  if (!settings.enabled || !settings.destination) return
  const bridge = androidCalendarBridge()
  const calendarId = settings.destination.id
  const events = await bridge.events(calendarId)
  const snapshot = currentCalendarSnapshot({
    publishedKeys: events.flatMap((event) => {
      const marker = parseEventMarker(event.description)
      return marker ? [marker.key] : []
    }),
    includeDetails: settings.includeDetails,
  })
  const now = Date.now()
  const { writes, deletes } = planAndroidPublish({
    events,
    snapshot,
    includeDetails: settings.includeDetails,
    now,
  })
  if (writes.length || deletes.length)
    await bridge.apply(calendarId, writes, deletes)

  useCalendarSync.setState({
    lastSyncedAt: Date.now(),
    upcomingCount: snapshot.entries.filter((entry) => entry.start >= now)
      .length,
    failingSince: null,
  })
  useCalendarPublishing.setState({ error: null })
}
