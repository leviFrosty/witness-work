import moment from 'moment'
import type { IncomingShare } from '@/features/buddies/lib/state'
import { sharedNoteFields } from '@/features/buddies/lib/sharedNotes'
import PlanDetailsInvitation, {
  type ShareAnswering,
} from '@/features/plans/components/PlanDetailsInvitation'
import PlanDetailsLayout from '@/features/plans/components/PlanDetailsLayout'
import PlanDetailsSummary from '@/features/plans/components/PlanDetailsSummary'

const NOT_ANSWERING: ShareAnswering = { busy: false, answer: () => {} }

/**
 * A buddy's Plan invitation with no Plan on the User's schedule: not answered
 * yet, or answered "Can't make it". Going adds the Plan back, and Plan Details
 * shows it. Without `answering` (the Plan has happened) it's only shown.
 */
export default function InvitationPlanDetails({
  share,
  answering,
}: {
  share: IncomingShare
  answering?: ShareAnswering
}) {
  const { details } = share
  return (
    <PlanDetailsLayout>
      <PlanDetailsSummary
        title={details.title}
        date={moment(details.d, 'YYYY-MM-DD').toDate()}
        startTimeInMinutes={details.s}
        minutes={details.m}
        location={details.location}
        note={sharedNoteFields(details)}
        lead={
          <PlanDetailsInvitation
            from={share.from}
            share={answering ? share : undefined}
            status={share.status === 'cancelled' ? 'pending' : share.status}
            answering={answering ?? NOT_ANSWERING}
          />
        }
      />
    </PlanDetailsLayout>
  )
}
