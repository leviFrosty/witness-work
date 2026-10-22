import { Timer as TimerIcon } from 'lucide-react-native'
import { useToastController } from '@tamagui/toast'
import { useShallow } from 'zustand/react/shallow'
import { setHoursLogging, shouldAskAboutHoursLogging } from '@/lib/hoursLogging'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'

/**
 * Asks a Kingdom Publisher once whether they want to log hours. New installs
 * answer in onboarding; this reaches everyone set up before that question. Any
 * answer, including dismissing it, retires it on every synced device.
 */
export default function useHoursLoggingNotification(): NotificationItem | null {
  const toast = useToastController()
  // This month's role: an auxiliary month already logs hours, so the question
  // waits until the Kingdom Publisher's next month.
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
          // One line: Android's native toast shows only the title.
          toast.show(i18n.t('hoursLoggingQuestion.turnedOn'), {
            native: true,
          })
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
