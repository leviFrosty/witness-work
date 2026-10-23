import { useNavigation } from '@react-navigation/native'
import InviteBuddiesFormRow from '@/components/InviteBuddiesFormRow'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyPicker from '@/features/buddies/components/BuddyPicker'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { planEndsAt, planShareKey } from '@/features/buddies/lib/shares'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type { RouteBuddiesSlot } from '@/features/route-planning/screens/RouteBuilderScreen'

/**
 * The route's Invite Buddies row, the Plan form's own. Invitations go out with
 * the route's Plan as soon as a buddy is picked, and taking one off cancels
 * theirs. With no Plan yet, the row makes one from the route.
 */
export default function RouteBuddies({
  dayPlanId,
  onCreatePlan,
}: RouteBuddiesSlot) {
  const navigation = useNavigation<RootStackNavigation>()
  const availability = useBuddiesAvailability()
  const active = useBuddies((state) => state.buddies).filter(
    (buddy) => buddy.status === 'active'
  )
  const buddyRequests = useBuddies((state) => state.incomingClaims.length)
  const dayPlan = useServiceReport((state) =>
    dayPlanId ? state.dayPlans.find((plan) => plan.id === dayPlanId) : undefined
  )
  const updateDayPlan = useServiceReport((state) => state.updateDayPlan)
  const invitedIds = dayPlan?.buddies ?? []
  const replies = useShareReplies(
    dayPlan && invitedIds.length ? planShareKey(dayPlan.id) : undefined
  )

  if (availability === 'hidden') return null

  // Before any buddy is confirmed, the row opens Buddies to set it up; not
  // while Buddies is turned off, which couldn't pair anyone.
  if (active.length === 0) {
    if (availability !== 'enabled') return null
    return (
      <InviteBuddiesFormRow
        testID='route-buddies-row'
        setUp={() => {
          analytics.capture('buddies_opened', {
            source: 'route_builder',
            has_requests: buddyRequests > 0,
          })
          navigation.navigate('Buddies')
        }}
      />
    )
  }

  if (!dayPlan) {
    return (
      <InviteBuddiesFormRow
        testID='route-buddies-row'
        setUp={onCreatePlan}
        description={i18n.t('routeBuilder_inviteMakesPlan')}
      />
    )
  }

  // A Plan that has happened is history: nobody new is invited to it.
  if (planEndsAt(dayPlan) <= Date.now()) return null

  const invite = (inboxIds: string[]) => {
    const added = inboxIds.filter((id) => !invitedIds.includes(id))
    updateDayPlan({
      id: dayPlan.id,
      buddies: inboxIds.length > 0 ? inboxIds : undefined,
    })
    if (added.length > 0) analytics.capture('route_buddy_invited')
  }

  const summary = active
    .filter((buddy) => invitedIds.includes(buddy.inboxId))
    .map(buddyDisplayName)
    .join(', ')

  return (
    <InviteBuddiesFormRow
      testID='route-buddies-row'
      summary={summary || undefined}
      picker={
        <BuddyPicker
          chipsOnly
          value={invitedIds}
          onChange={invite}
          replies={replies}
        />
      }
    />
  )
}
