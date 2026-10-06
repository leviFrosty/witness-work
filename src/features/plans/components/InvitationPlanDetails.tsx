import moment from 'moment'
import type { IncomingShare } from '@/features/buddies/lib/state'
import PlanDetailsInvitation, {
  type ShareAnswering,
} from '@/features/plans/components/PlanDetailsInvitation'
import PlanDetailsLayout from '@/features/plans/components/PlanDetailsLayout'
import PlanDetailsSummary from '@/features/plans/components/PlanDetailsSummary'

/**
 * A buddy's Plan invitation with no Plan on the User's schedule: not answered
 * yet, or answered "Can't make it". Going adds the Plan back, and Plan Details
 * shows it.
 */
export default function InvitationPlanDetails({
  share,
  answering,
}: {
  share: IncomingShare
  answering: ShareAnswering
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
        note={details.note}
        lead={
          <PlanDetailsInvitation
            from={share.from}
            share={share}
            status={share.status === 'cancelled' ? 'pending' : share.status}
            answering={answering}
          />
        }
      />
    </PlanDetailsLayout>
  )
}
