import { useLayoutEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import BadgeCelebrationOverlay from '@/features/badges/components/BadgeCelebrationOverlay'
import BadgeAudienceLine from '@/features/buddies/components/BadgeAudienceLine'
import MilestoneRevealOverlay from '@/features/milestones/components/MilestoneRevealOverlay'
import { useMilestoneRevealStore } from '@/features/milestones/stores/milestoneReveal'
import ScheduleIntroHost from '@/features/plans/components/schedule-intro/ScheduleIntroHost'
import StreakCelebration from '@/features/profile/components/StreakCelebration'
import WhatsNewSheet from '@/features/updates/components/WhatsNewSheet'
import UpdateRevealOverlay from '@/features/updates/components/reveal/UpdateRevealOverlay'
import { useUpdateRevealStore } from '@/features/updates/stores/updateReveal'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { newTakeoverId, useTakeover } from '@/stores/takeover'
import type { RootStackNavigation } from '@/types/rootStack'

type Props = {
  /** This launch opens on the update reveal, already in its first frame. */
  launchReveal: boolean
  /** This launch announces the releases since this version in What's New. */
  whatsNewSince?: string
}

/**
 * Every takeover HomeTabStack hosts (ADR 0021). Each asks the takeover arbiter
 * for its turn and renders only while it has it, so at most one is on screen;
 * the arbiter decides the order (`policy.ts`). The launch reveal is seeded on
 * screen before anything else can ask, since it picks up from the splash in the
 * very first frame. A new badge's card says which buddies will see it.
 */
export default function TakeoverHosts({
  launchReveal: launchRevealOnMount,
  whatsNewSince,
}: Props) {
  const rootNavigation = useNavigation<RootStackNavigation>()

  const [launchReveal, setLaunchReveal] = useState(launchRevealOnMount)
  const [launchRevealId] = useState(() => newTakeoverId('update-reveal'))
  // A layout effect runs before any host's request (those are passive
  // effects), so nothing is granted ahead of the reveal already on screen.
  useLayoutEffect(() => {
    if (!launchReveal) return
    useTakeover.getState().seed('update-reveal', { id: launchRevealId })
    return () => useTakeover.getState().release(launchRevealId)
  }, [launchReveal, launchRevealId])

  // Replays from the tray, What's New, or Developer Tools: the User asked.
  const replaySource = useUpdateRevealStore((s) => s.source)
  const dismissReplay = useUpdateRevealStore((s) => s.dismiss)
  const replay = useTakeoverTurn(
    'update-reveal',
    replaySource !== null && !launchReveal,
    { ignoresHolds: true }
  )
  const revealSource = launchReveal
    ? 'launch'
    : replay.active
      ? replaySource
      : null

  const [whatsNewWanted, setWhatsNewWanted] = useState(
    whatsNewSince !== undefined
  )
  const whatsNew = useTakeoverTurn('whats-new', whatsNewWanted)

  // The Milestone Update (1.38.2) is replay-only, from Developer Tools.
  const milestoneRequested = useMilestoneRevealStore((s) => s.show)
  const dismissMilestoneReveal = useMilestoneRevealStore((s) => s.dismiss)
  const milestone = useTakeoverTurn('milestone-reveal', milestoneRequested, {
    ignoresHolds: true,
  })

  return (
    <>
      {whatsNewSince && (
        <WhatsNewSheet
          sinceVersion={whatsNewSince}
          show={whatsNew.active}
          onClose={() => setWhatsNewWanted(false)}
        />
      )}
      <ScheduleIntroHost />
      <StreakCelebration />
      {/* After the tab navigator, so it covers the tab bar. */}
      {revealSource && (
        <UpdateRevealOverlay
          key={revealSource}
          source={revealSource}
          onClosed={() => {
            setLaunchReveal(false)
            dismissReplay()
          }}
        />
      )}
      <MilestoneRevealOverlay
        show={milestone.active}
        onDismiss={dismissMilestoneReveal}
        onSeeWhatsNew={() => {
          dismissMilestoneReveal()
          rootNavigation.navigate('MilestoneShowcase')
        }}
      />
      <BadgeCelebrationOverlay
        audience={(badge) => <BadgeAudienceLine badge={badge} />}
      />
    </>
  )
}
