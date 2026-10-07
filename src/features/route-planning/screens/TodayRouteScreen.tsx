import { useState } from 'react'
import { ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Wrapper from '@/components/ui/layout/Wrapper'
import RouteResult from '@/features/route-planning/components/RouteResult'
import RouteReview from '@/features/route-planning/components/RouteReview'
import useDayRouteStops from '@/features/route-planning/hooks/useDayRouteStops'
import useRoutePlanner from '@/features/route-planning/hooks/useRoutePlanner'

/**
 * Supporter "Plan today's route": review today's stops and the start, get the
 * shortest driving order, then open it in the default navigation app.
 */
export default function TodayRouteScreen() {
  const insets = useSafeAreaInsets()
  // Fixed for the visit, so a screen left open past midnight keeps its day.
  const [today] = useState(() => new Date())
  const { stops, missingLocationCount } = useDayRouteStops(today)
  const planner = useRoutePlanner(stops)

  return (
    <Wrapper insets='none' style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 30,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
      >
        {planner.route ? (
          <RouteResult
            route={planner.route}
            lastOpened={planner.lastOpened}
            onOpen={planner.open}
            onEditStops={planner.editStops}
          />
        ) : (
          <RouteReview
            included={planner.included}
            removed={planner.removed}
            startStop={planner.startStop}
            canRestore={planner.canRestore}
            missingLocationCount={missingLocationCount}
            planning={planner.planning}
            error={planner.error}
            onRemove={planner.remove}
            onRestore={planner.restore}
            onChooseStart={planner.chooseStart}
            onPlan={planner.plan}
          />
        )}
      </ScrollView>
    </Wrapper>
  )
}
