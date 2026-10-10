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
  /** Renders the Follow-up's buddies, below the Follow-up. */
  renderFollowUpBuddies?: FollowUpDetailsBuddiesSlot
}

/**
 * One Visit, read-only, in a sheet: its Contact, what happened, its Follow-up,
 * and the buddies invited along, with Edit and the Visit's other actions in the
 * header. Leaves once the Visit or its Contact is gone (deleted here, in the
 * form, or on another device).
 */
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
