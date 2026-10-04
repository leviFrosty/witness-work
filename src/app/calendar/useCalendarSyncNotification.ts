import { Platform } from 'react-native'
import { CalendarSync as CalendarSyncIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import { calendarBridgeAvailable } from '../../../modules/calendar-bridge'
import {
  calendarAction,
  quickConnectCalendar,
} from '@/app/calendar/calendarSync'
import { useCalendarSync } from '@/stores/calendarSync'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

type CalendarSyncSettings = ReturnType<typeof useCalendarSync.getState>

/** Not answered yet, and Calendar Sync isn't in use on this or another device. */
export const shouldInviteToCalendarSync = (settings: CalendarSyncSettings) =>
  !settings.promptAnswered &&
  !settings.enabled &&
  !settings.optedOut &&
  !settings.sharedCalendar

/**
 * Invites people who updated past the onboarding Calendar Sync step to set it
 * up. New installs answer it in onboarding. Any answer, including dismissing
 * it, retires it on this device.
 */
export default function useCalendarSyncNotification(): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()
  const visible = useCalendarSync(shouldInviteToCalendarSync)
  if (Platform.OS !== 'ios' || !calendarBridgeAvailable || !visible) return null

  const answer = () => useCalendarSync.setState({ promptAnswered: true })
  const openSettings = () => navigation.navigate('PreferencesCalendar')
  return {
    id: 'calendar_sync_intro',
    kind: 'calendar_sync',
    icon: CalendarSyncIcon,
    tone: 'accent',
    title: i18n.t('calendarOnboardingTitle'),
    description: i18n.t('calendarNotificationDescription'),
    actions: [
      {
        id: 'set_up',
        label: i18n.t('calendarOnboardingConnect'),
        onPress: () => {
          answer()
          calendarAction(quickConnectCalendar)
            .then((status) => {
              // Another device already publishes: show where, in Settings.
              if (status === 'elsewhere') return openSettings()
              toast.show(i18n.t('calendarSynced'), {
                message: i18n.t('calendarUpcomingCount' as TranslationKey, {
                  count: useCalendarSync.getState().upcomingCount,
                }),
                native: true,
              })
            })
            // Settings shows the error and the manual setup options.
            .catch(() => openSettings())
        },
      },
      {
        id: 'not_now',
        label: i18n.t('notNow'),
        inPlace: true,
        onPress: answer,
      },
    ],
    onDismiss: answer,
  }
}
