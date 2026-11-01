import { useEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import useNow from '@/hooks/useNow'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import type { RootStackParamList } from '@/types/rootStack'
import VisitDetails, {
  type FollowUpDetailsBuddiesSlot,
} from '@/features/visits/components/VisitDetails'

type Props = NativeStackScreenProps<RootStackParamList, 'Visit Details'> & {
  renderFollowUpBuddies?: FollowUpDetailsBuddiesSlot
}

export default function VisitDetailsScreen({
  route,
  navigation,
  renderFollowUpBuddies,
}: Props) {
  const { now } = useNow()
  const visit = useConversations((s) =>
    s.conversations.find((v) => v.id === route.params.visitId)
  )
  const contact = useContacts((s) =>
    visit ? s.contacts.find((c) => c.id === visit.contact.id) : undefined
  )
  const gone = !visit || !contact

  useEffect(() => {
    if (gone && navigation.canGoBack()) navigation.goBack()
  }, [gone, navigation])

  if (!visit || !contact) return null
  return (
    <VisitDetails
      visit={visit}
      contact={contact}
      now={now}
      renderFollowUpBuddies={renderFollowUpBuddies}
    />
  )
}
