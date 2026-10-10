import { Platform } from 'react-native'
import {
  androidCalendarBridge,
  calendarBridge,
  calendarBridgeAvailable,
} from '../../../modules/calendar-bridge'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { calendarAction, disconnectCalendar } from '@/app/calendar/calendarSync'
import { parseEventMarker } from '@/app/calendar/androidEvents'

/**
 * Dev tools only. Mock data must never reach the user's real calendar, so
 * generating it turns Calendar Sync off here first, keeping events already
 * published. Opting out also stops a handoff from reconnecting this device.
 */
export async function stopCalendarSyncForMockData() {
  if (useCalendarSync.getState().enabled)
    await calendarAction(() => disconnectCalendar(false, 'tools'), {
      report: false,
    }).catch(() => undefined)
  // Also covers a disconnect that failed before switching off.
  useCalendarSync.setState({ enabled: false, optedOut: true })
}

/**
 * Before Tools "Reset all": removes the events this device published, which the
 * reset would otherwise orphan along with the connection it forgets. Returns
 * false when there was nothing connected.
 */
export async function removeConnectedCalendarEvents() {
  const { enabled, destination } = useCalendarSync.getState()
  if (!enabled || !destination) return false
  await calendarAction(() => disconnectCalendar(true, 'tools'), {
    report: false,
  })
  return true
}

/**
 * Removes every WitnessWork event in every calendar this device can write to,
 * from any connection, including ones an earlier reset left behind. Turns
 * Calendar Sync off first so publishing doesn't put them back. On iOS, another
 * device still publishing to the same calendar needs Repair afterwards.
 */
export async function removeAllCalendarEvents(): Promise<number> {
  if (!calendarBridgeAvailable) throw new Error('CALENDAR_BINARY_REQUIRED')
  return calendarAction(
    async () => {
      const { enabled, destination } = useCalendarSync.getState()
      // Clears the shared connection too; the sweep below catches the rest.
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
