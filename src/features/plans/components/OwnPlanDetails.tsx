import moment from 'moment'
import type { PlanListItem } from '@/types/timeEntry'
import DetailsHeaderActions from '@/components/DetailsHeaderActions'
import usePublisher from '@/hooks/usePublisher'
import usePlanMenuActions from '@/hooks/usePlanMenuActions'
import { describeRecurrence } from '@/lib/recurrenceText'
import { planTypeLabel } from '@/lib/planTypeLabel'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import type { IncomingShare } from '@/features/buddies/lib/state'
import PlanDetailsBuddies from '@/features/plans/components/PlanDetailsBuddies'
import InvitationAnswerSection, {
  type ShareAnswering,
} from '@/features/buddies/components/InvitationAnswerSection'
import PlanDetailsLayout from '@/features/plans/components/PlanDetailsLayout'
import PlanDetailsSummary from '@/features/plans/components/PlanDetailsSummary'
import PlanDetailsTimer from '@/features/plans/components/PlanDetailsTimer'
import {
  trackPlanDetailsAction,
  type PlanDetailsAction,
} from '@/features/plans/lib/planDetailsAnalytics'

/**
 * The User's own Plan (or one date of a Recurring Plan) with Edit and More in
 * the header, the timer on the Plan's own day, then its buddies, or the
 * invitation it follows.
 */
export default function OwnPlanDetails({
  item,
  share,
  now,
  answering,
}: {
  item: PlanListItem
  /** The buddy's invitation this Plan follows, while it can be answered. */
  share?: IncomingShare
  now: number
  answering: ShareAnswering
}) {
  const categories = useCategories((state) => state.categories)
  const getRecurringPlanForDate = useServiceReport(
    (state) => state.getRecurringPlanForDate
  )
  const updateDayPlan = useServiceReport((state) => state.updateDayPlan)
  const { showsTimer } = usePublisher()
  const { plan } = item
  const isToday = moment(item.date).isSame(now, 'day')
  const track = (action: PlanDetailsAction) =>
    trackPlanDetailsAction(action, {
      kind: item.type,
      linked: item.type === 'day' && !!item.plan.buddyShare,
    })
  const { edit, menu, effective } = usePlanMenuActions(item, {
    withoutEdit: true,
    onDeleted: () => track('delete'),
  })

  return (
    <PlanDetailsLayout
      actions={<DetailsHeaderActions onEdit={edit} menu={menu} />}
    >
      <PlanDetailsSummary
        title={plan.title}
        date={item.date}
        startTimeInMinutes={effective.startTimeInMinutes}
        anytime={effective.anytime}
        minutes={effective.minutes}
        typeLabel={planTypeLabel(plan, categories)}
        repeats={
          item.type === 'recurring' ? describeRecurrence(item.plan) : undefined
        }
        changedForDate={
          item.type === 'recurring' &&
          !!getRecurringPlanForDate(item.plan.id, item.date)?.isOverride
        }
        location={plan.location}
        note={effective.note}
        // Ticking off a checklist item edits a Day Plan. A Recurring Plan's
        // note covers every date, and a linked Plan's is the organizer's.
        onNoteChange={
          item.type === 'day' && !item.plan.buddyShare
            ? (fields) => updateDayPlan({ id: item.plan.id, ...fields })
            : undefined
        }
        lead={
          <>
            {item.type === 'day' && item.plan.buddyShare ? (
              <InvitationAnswerSection
                from={item.plan.buddyShare.from}
                share={share}
                // The linked Plan is here, so it's "Going" (maybe said on
                // another device) until "Can't make it" removes it.
                status={share?.status === 'declined' ? 'declined' : 'going'}
                answering={answering}
              />
            ) : null}
            {showsTimer && isToday ? <PlanDetailsTimer /> : null}
          </>
        }
      />
      {/* Nothing for a Plan that follows an invitation: only its organizer
          invites people. */}
      <PlanDetailsBuddies
        item={item}
        now={now}
        onInvited={() => track('invite_buddy')}
      />
    </PlanDetailsLayout>
  )
}
