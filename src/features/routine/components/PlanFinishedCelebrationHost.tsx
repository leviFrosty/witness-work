import { useEffect } from 'react'
import { useNavigation } from '@react-navigation/native'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import type { RootStackNavigation } from '@/types/rootStack'
import PlanFinishedCelebration from '@/features/routine/components/PlanFinishedCelebration'
import {
  endPlanCelebration,
  usePlanCelebration,
} from '@/features/routine/stores/planCelebration'

const MAX_ON_SCREEN_MS = 30_000

export default function PlanFinishedCelebrationHost() {
  const navigation = useNavigation<RootStackNavigation>()
  const celebrating = usePlanCelebration((s) => s.celebrating)
  const turn = useTakeoverTurn('reading-plan-finished', celebrating !== null, {
    maxActiveMs: MAX_ON_SCREEN_MS,
    ignoresHolds: true,
  })
  useEffect(() => {
    if (turn.status === 'expired') endPlanCelebration()
  }, [turn.status])
  if (!celebrating || !turn.active) return null
  return (
    <PlanFinishedCelebration
      celebration={celebrating}
      onDone={endPlanCelebration}
      onChoosePlan={() => {
        endPlanCelebration()
        navigation.navigate('RoutineHabit', {
          habit: 'bibleReading',
          choosePlan: true,
        })
      }}
    />
  )
}
