import { RouteProp, useRoute } from '@react-navigation/native'
import BadgeCollectionView from '@/features/badges/components/BadgeCollectionView'
import useBadgesOpened from '@/features/badges/hooks/useBadgesOpened'
import type { RootStackParamList } from '@/types/rootStack'

/**
 * The User's badge collection. `buddiesAvailable` decides whether Two by Two
 * shows as a collection to grow; the app tier reads it from Buddies. A buddy's
 * badges live on their page in Buddies.
 */
export default function BadgesScreen({
  buddiesAvailable,
}: {
  buddiesAvailable: boolean
}) {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Badges'>>()
  useBadgesOpened(params?.source ?? 'other')
  return <BadgeCollectionView buddiesAvailable={buddiesAvailable} />
}
