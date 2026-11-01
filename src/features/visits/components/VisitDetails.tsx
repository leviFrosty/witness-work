import type { ReactNode } from 'react'
import { useNavigation } from '@react-navigation/native'
import DetailsHeaderActions from '@/components/DetailsHeaderActions'
import DetailsLayout from '@/components/ui/layout/DetailsLayout'
import useVisitMenuActions from '@/hooks/useVisitMenuActions'
import { followUpAnswer } from '@/lib/conversations'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Visit } from '@/types/visit'
import VisitDetailsContact from '@/features/visits/components/VisitDetailsContact'
import VisitFollowUpStop from '@/features/visits/components/VisitFollowUpStop'
import VisitNoFollowUpStop from '@/features/visits/components/VisitNoFollowUpStop'
import VisitPastStop from '@/features/visits/components/VisitPastStop'
import VisitRail, {
  type RailNode,
  type RailStop,
} from '@/features/visits/components/VisitRail'
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

const outcomeNode = (visit: Visit): RailNode =>
  visit.notAtHome ? 'notAtHome' : visit.isBibleStudy ? 'study' : 'conversation'

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

  const today: RailStop = { key: 'today', node: 'today' }
  const stops: RailStop[] = [
    {
      key: 'visit',
      node: outcomeNode(visit),
      content: <VisitPastStop visit={visit} contactName={contact.name} />,
    },
  ]
  if (visit.followUp && status) {
    const date = new Date(visit.followUp.date)

    const ahead = status !== 'kept' && date.getTime() > now
    const followUp: RailStop = {
      key: 'followUp',
      ahead,
      node:
        status === 'upcoming'
          ? 'ahead'
          : status === 'overdue'
            ? 'overdue'
            : status,
      content: (
        <VisitFollowUpStop
          followUp={visit.followUp}
          status={status}
          answer={answer}
          now={now}
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
          onLogVisit={logVisit}
          onReschedule={reschedule}
          onOpenVisit={openVisit}
        />
      ),
    }
    stops.push(...(ahead ? [today, followUp] : [followUp, today]))
  } else {
    const later = nextVisit(visit, contactVisits)
    const after: RailStop = {
      key: 'next',
      node: later ? outcomeNode(later) : 'empty',
      ahead: !later,
      content: (
        <VisitNoFollowUpStop
          later={later}
          now={now}
          onOpenVisit={openVisit}
          onPlan={planFollowUp}
        />
      ),
    }
    stops.push(...(later ? [after, today] : [today, after]))
  }

  stops.reverse()

  return (
    <DetailsLayout
      sheet
      title={i18n.t(visit.notAtHome ? 'notAtHome' : 'visitDetails_title')}
      actions={<DetailsHeaderActions onEdit={edit} menu={menu} />}
    >
      <VisitDetailsContact contact={contact} onOpen={openContact} />
      <VisitRail stops={stops} />
    </DetailsLayout>
  )
}
