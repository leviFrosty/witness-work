import type { PlanListItem } from '@/types/timeEntry'
import type { RootStackParamList } from '@/types/rootStack'
import DetailsHeaderActions from '@/components/DetailsHeaderActions'
import usePlanMenuActions from '@/hooks/usePlanMenuActions'
import { describeRecurrence } from '@/lib/recurrenceText'
import { planTypeLabel } from '@/lib/planTypeLabel'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { organizerMinutes } from '@/features/buddies/lib/linkedPlans'
import {
  incomingShareKey,
  type IncomingShare,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import PlanDetailsBuddies from '@/features/plans/components/PlanDetailsBuddies'
import InvitationAnswerSection, {
  type ShareAnswering,
} from '@/features/buddies/components/InvitationAnswerSection'
import PlanDetailsLayout from '@/features/plans/components/PlanDetailsLayout'
import PlanDetailsSummary from '@/features/plans/components/PlanDetailsSummary'
import {
  trackPlanDetailsAction,
  type PlanDetailsAction,
} from '@/features/plans/lib/planDetailsAnalytics'

const trackFor = (item: PlanListItem) => (action: PlanDetailsAction) =>
  trackPlanDetailsAction(action, {
    kind: item.type,
    linked: item.type === 'day' && !!item.plan.buddyShare,
  })

/**
 * "Anna planned 3 Hrs" for a Plan that follows Anna's invitation while the User
 * has set their own hours, else nothing.
 */
function useOrganizerHours(item: PlanListItem): string | undefined {
  const link = item.type === 'day' ? item.plan.buddyShare : undefined
  const invitation = useBuddies((state) =>
    link?.ownMinutes
      ? state.incomingShares[incomingShareKey(link.from, link.shareId)]
      : undefined
  )
  const organizer = useBuddies((state) =>
    link
      ? state.buddies.find((buddy) => buddy.inboxId === link.from)
      : undefined
  )
  const planned = invitation ? organizerMinutes(invitation) : undefined
  const { formatted } = useFormattedMinutes(planned ?? 0)
  if (planned === undefined || !organizer || planned === item.plan.minutes)
    return undefined
  return i18n.t('planForm_organizerPlanned', {
    name: buddyDisplayName(organizer),
    hours: formatted,
  })
}

/**
 * Edit and More for the User's own Plan, in Plan Details' header or a day
 * sheet's.
 */
export function OwnPlanDetailsActions({
  item,
  onEdit,
  onNavigate,
}: {
  item: PlanListItem
  /** Edits in place, instead of opening the Plan screen. */
  onEdit?: (params: RootStackParamList['PlanDay']) => void
  /** Runs a navigation from the menu; a host sheet closes itself first. */
  onNavigate?: (navigate: () => void) => void
}) {
  const { edit, menu } = usePlanMenuActions(item, {
    withoutEdit: true,
    edit: onEdit,
    go: onNavigate,
    onDeleted: () => trackFor(item)('delete'),
  })
  return <DetailsHeaderActions onEdit={edit} menu={menu} />
}

/**
 * The User's own Plan (or one date of a Recurring Plan), then its buddies, or
 * the invitation it follows.
 */
export function OwnPlanDetailsBody({
  item,
  share,
  now,
  answering,
  onOpenPlan,
}: {
  item: PlanListItem
  /** The buddy's invitation this Plan follows, while it can be answered. */
  share?: IncomingShare
  now: number
  answering: ShareAnswering
  /** Shows another Plan in place, instead of opening its Plan Details. */
  onOpenPlan?: (target: RootStackParamList['Plan Details']) => void
}) {
  const categories = useCategories((state) => state.categories)
  const getRecurringPlanForDate = useServiceReport(
    (state) => state.getRecurringPlanForDate
  )
  const updateDayPlan = useServiceReport((state) => state.updateDayPlan)
  const { plan } = item
  const { effective } = usePlanMenuActions(item)
  const organizerHours = useOrganizerHours(item)

  return (
    <>
      <PlanDetailsSummary
        title={plan.title}
        date={item.date}
        startTimeInMinutes={effective.startTimeInMinutes}
        anytime={effective.anytime}
        minutes={effective.minutes}
        minutesDescription={organizerHours}
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
          item.type === 'day' && item.plan.buddyShare ? (
            <InvitationAnswerSection
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
        onInvited={() => trackFor(item)('invite_buddy')}
        onOpenPlan={onOpenPlan}
      />
    </>
  )
}

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
  return (
    <PlanDetailsLayout actions={<OwnPlanDetailsActions item={item} />}>
      <OwnPlanDetailsBody
        item={item}
        share={share}
        now={now}
        answering={answering}
      />
    </PlanDetailsLayout>
  )
}
