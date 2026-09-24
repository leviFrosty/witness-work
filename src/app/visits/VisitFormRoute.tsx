import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import VisitFormScreen from '@/features/visits/screens/VisitFormScreen'
import FollowUpBuddyPicker from '@/features/buddies/components/FollowUpBuddyPicker'

/**
 * The Visit form with Buddies plugged into its Follow-up section. Visits can't
 * import Buddies (feature boundary), so the app tier supplies the row.
 */
export default function VisitFormRoute(
  props: NativeStackScreenProps<RootStackParamList, 'Visit Form'>
) {
  return (
    <VisitFormScreen
      {...props}
      renderFollowUpBuddies={(slot) => <FollowUpBuddyPicker {...slot} />}
    />
  )
}
