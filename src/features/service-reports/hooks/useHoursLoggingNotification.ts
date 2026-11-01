import { Timer as TimerIcon } from 'lucide-react-native'
import { toast } from '@/stores/toasts'
import { useShallow } from 'zustand/react/shallow'
import { setHoursLogging, shouldAskAboutHoursLogging } from '@/lib/hoursLogging'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'

export default function useHoursLoggingNotification(): NotificationItem | null {
  const { type: role } = usePublisher()
  const { logsHours, hoursLoggingAsked } = usePreferences(
    useShallow((s) => ({
      logsHours: s.logsHours,
      hoursLoggingAsked: s.hoursLoggingAsked,
    }))
  )
  if (!shouldAskAboutHoursLogging({ role, logsHours, hoursLoggingAsked })) {
    return null
  }

  const decline = () => setHoursLogging(false, 'tray')
  return {
    id: 'hours_logging_question',
    kind: 'hours_logging',
    icon: TimerIcon,
    tone: 'accent',
    title: i18n.t('hoursLoggingQuestion.title'),
    description: i18n.t('hoursLoggingQuestion.notificationDescription'),
    actions: [
      {
        id: 'turn_on',
        label: i18n.t('hoursLoggingQuestion.turnOn'),
        onPress: () => {
          setHoursLogging(true, 'tray')
          toast.success(i18n.t('hoursLoggingQuestion.turnedOn'))
        },
      },
      {
        id: 'no_thanks',
        label: i18n.t('hoursLoggingQuestion.decline'),
        inPlace: true,
        onPress: decline,
      },
    ],
    onDismiss: decline,
  }
}
