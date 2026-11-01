import moment from 'moment'
import { ArrowLeftRight as ArrowLeftRightIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { useRollover } from '@/features/service-reports/hooks/useRollover'

export default function useRolloverNotification(): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const { pending, markerKey } = useRollover()
  const [source] = pending
  if (!source) return null

  return {
    id: `rollover:${markerKey}`,
    kind: 'rollover',
    icon: ArrowLeftRightIcon,
    title: i18n.t('timeRollover_inlineCard', {
      minutes: source.minutes,
      from: moment({
        year: source.sourceYear,
        month: source.sourceMonth,
      }).format('MMMM'),
    }),
    description: i18n.t('timeRollover_intro'),
    actions: [
      {
        id: 'review',
        label: i18n.t('notifications_review'),
        onPress: () => navigation.navigate('Rollover'),
      },
    ],
  }
}
