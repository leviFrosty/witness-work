import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useServiceReport from '@/stores/serviceReport'
import RouteBuddies from '@/app/route-planning/RouteBuddies'
import RouteBuilderScreen from '@/features/route-planning/screens/RouteBuilderScreen'

/** Composes the Plan's buddies into the route builder across feature tiers. */
export default function RouteBuilderRouteScreen() {
  const enabled = useBuddiesEnabled()
  const dayPlans = useServiceReport((state) => state.dayPlans)

  return (
    <RouteBuilderScreen
      renderBuddies={
        enabled
          ? (slot) =>
              // Only its organizer invites people to a Plan that follows an
              // invitation.
              dayPlans.find((plan) => plan.id === slot.dayPlanId)
                ?.buddyShare ? null : (
                <RouteBuddies {...slot} />
              )
          : undefined
      }
    />
  )
}
