import { RouteProp, useRoute } from '@react-navigation/native'
import BadgeCollectionView from '@/features/badges/components/BadgeCollectionView'
import useBadgesOpened from '@/features/badges/hooks/useBadgesOpened'
import type { RootStackParamList } from '@/types/rootStack'

export default function BadgesScreen({
  buddiesAvailable,
}: {
  buddiesAvailable: boolean
}) {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Badges'>>()
  useBadgesOpened(params?.source ?? 'other')
  return <BadgeCollectionView buddiesAvailable={buddiesAvailable} />
}
