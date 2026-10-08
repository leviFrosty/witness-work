import { Linking, Platform } from 'react-native'
import { CalendarX as CalendarXIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { calendarBridgeAvailable } from '../../../modules/calendar-bridge'
import { confirmDisconnectCalendar } from '@/app/calendar/confirmDisconnectCalendar'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

type Settings = ReturnType<typeof useCalendarSync.getState>
type Publishing = ReturnType<typeof useCalendarPublishing.getState>

/** Usually clear once the connection or the calendar account catches up. */
const TRANSIENT_ERRORS = ['calendarConnectionError', 'calendarWaitingForEvents']
export const TRANSIENT_ALERT_DELAY_MS = 24 * 60 * 60 * 1000

/**
 * The failure worth interrupting for: only while Calendar Sync is on and this
 * device publishes. Declining or turning it off never alerts. Problems that
 * usually fix themselves wait a day; ones that need the user show at once.
 */
export function pausedCalendarSync(
  settings: Settings,
  publishing: Publishing,
  now: number
): { error: string; since: number } | null {
  const { error, state, deviceId } = publishing
  if (!settings.enabled || settings.optedOut || !settings.destination)
    return null
  if (!error || !settings.failingSince) return null
  // Another device publishes to this account's calendar; nothing to fix here.
  // A new iCloud account's record doesn't count: that's the problem itself.
  const elsewhere =
    !!state?.primary &&
    state.primary !== deviceId &&
    state.namespace === settings.namespace
  if (elsewhere) return null
  if (
    TRANSIENT_ERRORS.includes(error) &&
    now - settings.failingSince < TRANSIENT_ALERT_DELAY_MS
  )
    return null
  return { error, since: settings.failingSince }
}

/**
 * Calendar Sync stopped updating for someone who turned it on. Offers the fix
 * and a way out; dismissing it hides it until updates fail again.
 */
export default function useCalendarSyncPausedNotification(
  now: number
): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const settings = useCalendarSync()
  const publishing = useCalendarPublishing()
  if (Platform.OS !== 'ios' || !calendarBridgeAvailable) return null
  const paused = pausedCalendarSync(settings, publishing, now)
  if (!paused) return null
  const isPrimary =
    !!publishing.deviceId && publishing.state?.primary === publishing.deviceId
  return {
    id: `calendar_sync:paused:${paused.since}`,
    kind: 'calendar_sync',
    icon: CalendarXIcon,
    tone: 'warn',
    title: i18n.t('calendarSyncPaused'),
    description: i18n.t(paused.error as TranslationKey),
    actions: [
      paused.error === 'calendarPermissionError'
        ? {
            id: 'open_settings',
            label: i18n.t('calendarOpenSettings'),
            onPress: () => {
              void Linking.openSettings()
            },
          }
        : {
            id: 'open_calendar_sync',
            label: i18n.t('calendarSync'),
            onPress: () => navigation.navigate('PreferencesCalendar'),
          },
      {
        id: 'turn_off',
        label: i18n.t('calendarTurnOff'),
        inPlace: true,
        onPress: () => confirmDisconnectCalendar({ isPrimary, source: 'tray' }),
      },
    ],
  }
}
