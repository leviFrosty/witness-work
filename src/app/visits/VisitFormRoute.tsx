import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import VisitFormScreen from '@/features/visits/screens/VisitFormScreen'
import FollowUpBuddyPicker from '@/features/buddies/components/FollowUpBuddyPicker'

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
