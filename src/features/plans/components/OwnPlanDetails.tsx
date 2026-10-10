import { Pencil as PencilIcon } from 'lucide-react-native'
import type { PlanListItem } from '@/types/timeEntry'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import usePlanMenuActions from '@/hooks/usePlanMenuActions'
import i18n from '@/lib/locales'
import { describeRecurrence } from '@/lib/recurrenceText'
import { planTypeLabel } from '@/lib/planTypeLabel'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import type { IncomingShare } from '@/features/buddies/lib/state'
import PlanDetailsBuddies from '@/features/plans/components/PlanDetailsBuddies'
import PlanDetailsInvitation, {
  type ShareAnswering,
} from '@/features/plans/components/PlanDetailsInvitation'
import PlanDetailsLayout from '@/features/plans/components/PlanDetailsLayout'
import PlanDetailsSummary from '@/features/plans/components/PlanDetailsSummary'
import {
  trackPlanDetailsAction,
  type PlanDetailsAction,
} from '@/features/plans/lib/planDetailsAnalytics'

/**
 * The User's own Plan (or one date of a Recurring Plan) with Edit and More in
 * the header, then its buddies, or the invitation it follows.
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
  const { plan } = item
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
      actions={
        <>
          <PointerTooltip label={i18n.t('edit')} effect='none'>
            <IconButton
              icon={PencilIcon}
              size={20}
              onPress={edit}
              accessibilityLabel={i18n.t('edit')}
            />
          </PointerTooltip>
          <PointerTooltip label={i18n.t('more')} effect='none'>
            <PullDownMenu
              actions={menu}
              accessibilityLabel={i18n.t('more')}
              triggerSize={20}
            />
          </PointerTooltip>
        </>
      }
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
        lead={
          item.type === 'day' && item.plan.buddyShare ? (
            <PlanDetailsInvitation
              from={item.plan.buddyShare.from}
              share={share}
              // The linked Plan is here, so it's "Going" (maybe said on another
              // device) until "Can't make it" removes it.
              status={share?.status === 'declined' ? 'declined' : 'going'}
              answering={answering}
            />
          ) : undefined
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
