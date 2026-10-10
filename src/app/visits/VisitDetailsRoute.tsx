import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import VisitDetailsScreen from '@/features/visits/screens/VisitDetailsScreen'
import FollowUpDetailsBuddies from '@/features/buddies/components/FollowUpDetailsBuddies'

/**
 * Visit Details with Buddies plugged in below the Follow-up. Visits can't
 * import Buddies (feature boundary), so the app tier supplies the section.
 */
export default function VisitDetailsRoute(
  props: NativeStackScreenProps<RootStackParamList, 'Visit Details'>
) {
  return (
    <VisitDetailsScreen
      {...props}
      renderFollowUpBuddies={(slot) => <FollowUpDetailsBuddies {...slot} />}
    />
  )
}
