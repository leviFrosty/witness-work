import moment from 'moment'
import type { IncomingShare } from '@/features/buddies/lib/state'
import { sharedNoteFields } from '@/features/buddies/lib/sharedNotes'
import InvitationAnswerSection, {
  type ShareAnswering,
} from '@/features/buddies/components/InvitationAnswerSection'
import PlanDetailsLayout from '@/features/plans/components/PlanDetailsLayout'
import PlanDetailsSummary from '@/features/plans/components/PlanDetailsSummary'

const NOT_ANSWERING: ShareAnswering = { busy: false, answer: () => {} }

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
          <InvitationAnswerSection
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
