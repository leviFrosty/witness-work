import { useNavigation } from '@react-navigation/native'
import { ChartColumn as ChartColumnIcon } from 'lucide-react-native'
import { analytics } from '@/lib/analytics'
import { useFeatureFlag } from '@/lib/featureFlags'
import i18n from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { useTerritoryVisits } from '@/features/territories/stores/territoryVisits'

export const TERRITORY_INSIGHTS_NOTIFICATION_ID = 'territory_insights_ready'

export default function useTerritoryInsightsNotification(): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useFeatureFlag('territories')
  const readyAt = useTerritoryVisits((state) => state.readyAt)
  const seenAt = useTerritoryVisits((state) => state.seenAt)
  if (!enabled || readyAt === undefined || seenAt !== undefined) return null

  return {
    id: TERRITORY_INSIGHTS_NOTIFICATION_ID,
    kind: 'territory_insights',
    at: readyAt,
    icon: ChartColumnIcon,
    tone: 'accent',
    title: i18n.t('territories.insights.readyTitle'),
    description: i18n.t('territories.insights.readyDescription'),
    actions: [
      {
        id: 'view',
        label: i18n.t('view'),
        onPress: () => {
          analytics.capture('territory_insights_opened', { source: 'tray' })
          navigation.navigate('TerritoryInsights')
        },
      },
    ],
  }
}
