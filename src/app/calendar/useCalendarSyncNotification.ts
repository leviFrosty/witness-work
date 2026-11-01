import { CalendarSync as CalendarSyncIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { toast } from '@/stores/toasts'
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

export const shouldInviteToCalendarSync = (settings: CalendarSyncSettings) =>
  !settings.promptAnswered &&
  !settings.enabled &&
  !settings.optedOut &&
  !settings.sharedCalendar

export default function useCalendarSyncNotification(): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const visible = useCalendarSync(shouldInviteToCalendarSync)
  if (!calendarBridgeAvailable || !visible) return null

  const answer = () => useCalendarSync.setState({ promptAnswered: true })

  const decline = () =>
    useCalendarSync.setState({ promptAnswered: true, optedOut: true })
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
              if (status === 'elsewhere') return openSettings()
              toast.success(i18n.t('calendarSynced'), {
                message: i18n.t('calendarUpcomingCount' as TranslationKey, {
                  count: useCalendarSync.getState().upcomingCount,
                }),
              })
            })

            .catch(() => openSettings())
        },
      },
      {
        id: 'not_now',
        label: i18n.t('notNow'),
        inPlace: true,
        onPress: decline,
      },
    ],
    onDismiss: decline,
  }
}
