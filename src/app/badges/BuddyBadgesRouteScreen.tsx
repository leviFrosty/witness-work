import { useEffect, useLayoutEffect } from 'react'
import {
  type RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import Header from '@/components/ui/layout/Header'
import BuddyBadgesScreen from '@/features/badges/screens/BuddyBadgesScreen'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

export default function BuddyBadgesRouteScreen() {
  const navigation = useNavigation<RootStackNavigation>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'BuddyBadges'>>()
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === params.inboxId)
  )
  const name = buddy ? buddyDisplayName(buddy) : null

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={
            name
              ? i18n.t('badges_buddyCollectionTitle', { name })
              : i18n.t('badges_title')
          }
        />
      ),
    })
  }, [name, navigation])

  useEffect(() => {
    if (!buddy) navigation.goBack()
  }, [buddy, navigation])
  if (!buddy) return null

  return <BuddyBadgesScreen inboxId={buddy.inboxId} badges={buddy.badges} />
}
