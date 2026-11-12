import type { ReactNode } from 'react'
import { useNavigation } from '@react-navigation/native'
import DetailsHeaderActions from '@/components/DetailsHeaderActions'
import DetailsLayout from '@/components/ui/layout/DetailsLayout'
import { useContactActionColor } from '@/hooks/useContactActionColor'
import useDismissFollowUp from '@/hooks/useDismissFollowUp'
import useLogNotAtHome from '@/hooks/useLogNotAtHome'
import useVisitMenuActions from '@/hooks/useVisitMenuActions'
import { followUpAnswer } from '@/lib/conversations'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Visit } from '@/types/visit'
import VisitDetailsContact from '@/features/visits/components/VisitDetailsContact'
import VisitFollowUpCard from '@/features/visits/components/VisitFollowUpCard'
import VisitSummaryCard from '@/features/visits/components/VisitSummaryCard'
import { followUpStatus, nextVisit } from '@/features/visits/lib/visitDetails'
import {
  trackVisitDetailsAction,
  type VisitDetailsAction,
} from '@/features/visits/lib/visitDetailsAnalytics'

export type FollowUpDetailsBuddiesSlot = (props: {
  visit: Visit
  now: number

  onInvited: () => void

  surface: string
}) => ReactNode

export default function VisitDetails({
  visit,
  contact,
  now,
  renderFollowUpBuddies,
}: {
  visit: Visit
  contact: Contact
  now: number
  renderFollowUpBuddies?: FollowUpDetailsBuddiesSlot
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const conversations = useConversations((s) => s.conversations)
  const actionColor = useContactActionColor(contact)
  const dismissFollowUp = useDismissFollowUp()
  const notAtHome = useLogNotAtHome()
  const contactVisits = conversations.filter(
    (other) => other.contact.id === visit.contact.id
  )
  const status = followUpStatus(visit, contactVisits, now)
  const answer = followUpAnswer(visit, contactVisits)
  const track = (action: VisitDetailsAction) =>
    trackVisitDetailsAction(action, {
      notAtHome: !!visit.notAtHome,
      hasFollowUp: !!visit.followUp,
    })
  const { edit, reschedule, menu } = useVisitMenuActions(visit, {
    withoutEdit: true,
    overSheet: true,
    onDeleted: () => track('delete'),
  })

  const openContact = () => {
    const state = navigation.getState()
    const opener = state?.routes[state.index - 1]
    navigation.goBack()
    if (
      opener?.name === 'Contact Details' &&
      (opener.params as { id?: string } | undefined)?.id === contact.id
    )
      return
    navigation.push('Contact Details', {
      id: contact.id,
      highlightedVisitId: visit.id,
    })
  }

  const logVisit = () =>
    navigation.navigate('Visit Form', {
      contactId: contact.id,
      followUpVisitId: visit.id,
      returnOnSave: true,
      overSheet: true,
    })

  const planFollowUp = () =>
    navigation.navigate('Visit Form', {
      contactId: contact.id,
      visitToEditId: visit.id,
      notAtHome: visit.notAtHome,
      overSheet: true,
      planFollowUp: true,
    })

  const openVisit = (visitId: string) =>
    navigation.push('Visit Details', { visitId })

  const followUpFirst =
    status === 'upcoming' ||
    status === 'overdue' ||
    (status === 'kept' && !!answer?.notAtHome)
  const summary = <VisitSummaryCard visit={visit} />

  return (
    <DetailsLayout
      sheet
      title={i18n.t(visit.notAtHome ? 'notAtHome' : 'visitDetails_title')}
      actions={<DetailsHeaderActions onEdit={edit} menu={menu} />}
    >
      <VisitDetailsContact contact={contact} onOpen={openContact} />
      {followUpFirst ? null : summary}
      <VisitFollowUpCard
        visit={visit}
        contactId={contact.id}
        status={status}
        answer={answer}
        later={status ? undefined : nextVisit(visit, contactVisits)}
        now={now}
        actionColor={actionColor}
        renderBuddies={
          dataProtectionMode || !renderFollowUpBuddies
            ? undefined
            : (surface) =>
                renderFollowUpBuddies({
                  visit,
                  now,
                  surface,
                  onInvited: () => track('invite_buddy'),
                })
        }
        onEdit={planFollowUp}
        onReschedule={reschedule}
        onDismiss={() => dismissFollowUp(visit)}
        onLogVisit={logVisit}
        onNotAtHome={() =>
          notAtHome.logWithUndo(contact, { source: 'visit_details' })
        }
        onOpenVisit={openVisit}
      />
      {followUpFirst ? summary : null}
    </DetailsLayout>
  )
}
