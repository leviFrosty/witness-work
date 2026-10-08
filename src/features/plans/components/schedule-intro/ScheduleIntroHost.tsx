import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { useScheduleIntro } from '@/stores/scheduleIntro'
import ScheduleIntroOverlay from '@/features/plans/components/schedule-intro/ScheduleIntroOverlay'

/**
 * Mounted once in HomeTabStack; shows the Schedule intro once the takeover
 * arbiter gives it a turn (ADR 0021): after the update reveal, never over it or
 * a celebration. Schedule's "?" is the User asking, so it shows even while the
 * screen is held.
 */
export default function ScheduleIntroHost() {
  const source = useScheduleIntro((state) => state.source)
  const turn = useTakeoverTurn('schedule-intro', source !== null, {
    ignoresHolds: source === 'help',
  })
  if (!source || !turn.active) return null
  return <ScheduleIntroOverlay key={source} source={source} />
}
