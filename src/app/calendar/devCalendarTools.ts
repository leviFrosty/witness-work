import { Platform } from 'react-native'
import {
  androidCalendarBridge,
  calendarBridge,
  calendarBridgeAvailable,
} from '../../../modules/calendar-bridge'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { calendarAction, disconnectCalendar } from '@/app/calendar/calendarSync'
import { parseEventMarker } from '@/app/calendar/androidEvents'

export async function stopCalendarSyncForMockData() {
  if (useCalendarSync.getState().enabled)
    await calendarAction(() => disconnectCalendar(false, 'tools'), {
      report: false,
    }).catch(() => undefined)

  useCalendarSync.setState({ enabled: false, optedOut: true })
}

export async function removeConnectedCalendarEvents() {
  const { enabled, destination } = useCalendarSync.getState()
  if (!enabled || !destination) return false
  await calendarAction(() => disconnectCalendar(true, 'tools'), {
    report: false,
  })
  return true
}

export async function removeAllCalendarEvents(): Promise<number> {
  if (!calendarBridgeAvailable) throw new Error('CALENDAR_BINARY_REQUIRED')
  return calendarAction(
    async () => {
      const { enabled, destination } = useCalendarSync.getState()

      if (enabled && destination)
        await disconnectCalendar(true, 'tools').catch(() => undefined)
      useCalendarSync.setState({
        enabled: false,
        optedOut: true,
        lastSyncedAt: null,
        failingSince: null,
        upcomingCount: 0,
      })
      useCalendarPublishing.setState({ error: null })
      if (Platform.OS === 'android') return removeAllAndroidEvents()
      if (!(await calendarBridge().requestAccess()))
        throw new Error('CALENDAR_PERMISSION')
      return calendarBridge().removeAllMarkedEvents()
    },
    { report: false }
  )
}

async function removeAllAndroidEvents() {
  const bridge = androidCalendarBridge()
  if (!(await bridge.requestAccess())) throw new Error('CALENDAR_PERMISSION')
  let removed = 0
  for (const calendar of await bridge.destinations()) {
    const marked = (await bridge.events(calendar.id))
      .filter((event) => parseEventMarker(event.description))
      .map((event) => event.id)
    if (!marked.length) continue
    await bridge.apply(calendar.id, [], marked)
    removed += marked.length
  }
  return removed
}
