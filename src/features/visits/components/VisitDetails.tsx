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

/** The Follow-up's buddies on Visit Details, supplied by the app tier. */
export type FollowUpDetailsBuddiesSlot = (props: {
  visit: Visit
  now: number
  /** Invite Buddies added someone. */
  onInvited: () => void
  /** The color behind it, for the rings between stacked avatars. */
  surface: string
}) => ReactNode

/** The rail node for what happened at a Visit. */
const outcomeNode = (visit: Visit): RailNode =>
  visit.notAtHome ? 'notAtHome' : visit.isBibleStudy ? 'study' : 'conversation'

/**
 * A Visit with Edit and More in the header: who it was with, then its story
 * down a rail, with what happened, today, and its Follow-up (with the buddies
 * going), each told in the right tense.
 */
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

  // Back to the Contact this sheet was opened from, or close it and open them.
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
      returnOnSave: true,
      overSheet: true,
    })

  // The edit form with Follow Up already on.
  const planFollowUp = () =>
    navigation.navigate('Visit Form', {
      contactId: contact.id,
      visitToEditId: visit.id,
      notAtHome: visit.notAtHome,
      overSheet: true,
      planFollowUp: true,
    })

  // Another of the contact's Visits, as a sheet over this one.
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
    // Kept means done, even if its planned time is later today.
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
          // Follow-up invitations are off in data protection mode.
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
