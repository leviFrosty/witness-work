import { type ComponentProps, useLayoutEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import BadgeCelebrationOverlay from '@/features/badges/components/BadgeCelebrationOverlay'
import PetUnlockRevealHost from '@/features/pet/components/PetUnlockRevealHost'
import type MilestoneRevealOverlayComponent from '@/features/milestones/components/MilestoneRevealOverlay'
import { useMilestoneRevealStore } from '@/features/milestones/stores/milestoneReveal'
import ScheduleIntroHost from '@/features/plans/components/schedule-intro/ScheduleIntroHost'
import StreakCelebration from '@/features/profile/components/StreakCelebration'
import type WhatsNewSheetComponent from '@/features/updates/components/WhatsNewSheet'
import type UpdateRevealOverlayComponent from '@/features/updates/components/reveal/UpdateRevealOverlay'
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
 *
 * Every takeover's visuals load the first time it gets a turn, so a launch
 * doesn't evaluate screens it almost never shows.
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
  // Stays mounted once shown, so the sheet can animate closed.
  const [whatsNewShown, setWhatsNewShown] = useState(false)
  if (whatsNew.active && !whatsNewShown) setWhatsNewShown(true)

  // The Milestone Update (1.38.2) is replay-only, from Developer Tools.
  const milestoneRequested = useMilestoneRevealStore((s) => s.show)
  const dismissMilestoneReveal = useMilestoneRevealStore((s) => s.dismiss)
  const milestone = useTakeoverTurn('milestone-reveal', milestoneRequested, {
    ignoresHolds: true,
  })

  return (
    <>
      {whatsNewSince && whatsNewShown && (
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
      {milestone.active && (
        <MilestoneRevealOverlay
          show
          onDismiss={dismissMilestoneReveal}
          onSeeWhatsNew={() => {
            dismissMilestoneReveal()
            rootNavigation.navigate('MilestoneShowcase')
          }}
        />
      )}
      <BadgeCelebrationOverlay />
      <PetUnlockRevealHost />
    </>
  )
}

function WhatsNewSheet(props: ComponentProps<typeof WhatsNewSheetComponent>) {
  const Sheet: typeof WhatsNewSheetComponent =
    require('@/features/updates/components/WhatsNewSheet').default
  return <Sheet {...props} />
}

function UpdateRevealOverlay(
  props: ComponentProps<typeof UpdateRevealOverlayComponent>
) {
  const Overlay: typeof UpdateRevealOverlayComponent =
    require('@/features/updates/components/reveal/UpdateRevealOverlay').default
  return <Overlay {...props} />
}

function MilestoneRevealOverlay(
  props: ComponentProps<typeof MilestoneRevealOverlayComponent>
) {
  const Overlay: typeof MilestoneRevealOverlayComponent =
    require('@/features/milestones/components/MilestoneRevealOverlay').default
  return <Overlay {...props} />
}
