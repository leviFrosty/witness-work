import type { ComponentProps } from 'react'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { useScheduleIntro } from '@/stores/scheduleIntro'
import type ScheduleIntroOverlayComponent from '@/features/plans/components/schedule-intro/ScheduleIntroOverlay'

export default function ScheduleIntroHost() {
  const source = useScheduleIntro((state) => state.source)
  const turn = useTakeoverTurn('schedule-intro', source !== null)
  if (!source || !turn.active) return null
  return <ScheduleIntroOverlay key={source} source={source} />
}

function ScheduleIntroOverlay(
  props: ComponentProps<typeof ScheduleIntroOverlayComponent>
) {
  const Overlay: typeof ScheduleIntroOverlayComponent =
    require('@/features/plans/components/schedule-intro/ScheduleIntroOverlay').default
  return <Overlay {...props} />
}
