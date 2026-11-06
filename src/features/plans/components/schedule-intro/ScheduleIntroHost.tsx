import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { useScheduleIntro } from '@/stores/scheduleIntro'
import type ScheduleIntroOverlayComponent from '@/features/plans/components/schedule-intro/ScheduleIntroOverlay'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'

/**
 * Mounted once in HomeTabStack; shows the Schedule intro once the takeover
 * arbiter gives it a turn (ADR 0021): after the update reveal, never over it or
 * a celebration.
 */
export default function ScheduleIntroHost() {
  const source = useScheduleIntro((state) => state.source)
  const turn = useTakeoverTurn('schedule-intro', source !== null)
  if (!source || !turn.active) return null
  return <ScheduleIntroOverlay key={source} source={source} />
}

/** The intro's module loads the first time it shows, not at launch. */
const ScheduleIntroOverlay = canvasKitComponent(
  (): typeof ScheduleIntroOverlayComponent =>
    require('@/features/plans/components/schedule-intro/ScheduleIntroOverlay')
      .default
)
