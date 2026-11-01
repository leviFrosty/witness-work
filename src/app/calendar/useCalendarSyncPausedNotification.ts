import { Linking, Platform } from 'react-native'
import { CalendarX as CalendarXIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { calendarBridgeAvailable } from '../../../modules/calendar-bridge'
import { calendarRecovery } from '@/app/calendar/calendarRecovery'
import { confirmDisconnectCalendar } from '@/app/calendar/confirmDisconnectCalendar'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { useShallow } from 'zustand/react/shallow'

type Settings = Pick<
  ReturnType<typeof useCalendarSync.getState>,
  'enabled' | 'optedOut' | 'destination' | 'failingSince' | 'namespace'
>
type Publishing = Pick<
  ReturnType<typeof useCalendarPublishing.getState>,
  'error' | 'state' | 'deviceId'
>

const TRANSIENT_ERRORS = [
  'calendarConnectionError',
  'calendarConnectionErrorAndroid',
  'calendarWaitingForEvents',
]
export const TRANSIENT_ALERT_DELAY_MS = 24 * 60 * 60 * 1000

export function pausedCalendarSync(
  settings: Settings,
  publishing: Publishing,
  now: number
): { error: string; since: number } | null {
  const { error, state, deviceId } = publishing
  if (!settings.enabled || settings.optedOut || !settings.destination)
    return null
  if (!error || !settings.failingSince) return null

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

export default function useCalendarSyncPausedNotification(
  now: number
): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()

  const settings = useCalendarSync(
    useShallow(
      (s): Settings => ({
        enabled: s.enabled,
        optedOut: s.optedOut,
        destination: s.destination,
        failingSince: s.failingSince,
        namespace: s.namespace,
      })
    )
  )
  const publishing = useCalendarPublishing(
    useShallow(
      (s): Publishing => ({
        error: s.error,
        state: s.state,
        deviceId: s.deviceId,
      })
    )
  )
  if (!calendarBridgeAvailable) return null
  const paused = pausedCalendarSync(settings, publishing, now)
  if (!paused) return null

  const isPrimary =
    Platform.OS === 'android' ||
    (!!publishing.deviceId && publishing.state?.primary === publishing.deviceId)
  return {
    id: `calendar_sync:paused:${paused.since}`,
    kind: 'calendar_sync',
    icon: CalendarXIcon,
    tone: 'warn',
    title: i18n.t('calendarSyncPaused'),
    description: i18n.t(paused.error as TranslationKey),
    actions: [
      calendarRecovery(paused.error) === 'open_settings'
        ? {
            id: 'open_settings',
            label: i18n.t(
              Platform.OS === 'android'
                ? 'calendarOpenSettingsAndroid'
                : 'calendarOpenSettings'
            ),
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
