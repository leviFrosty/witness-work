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
  launchReveal: boolean

  whatsNewSince?: string
}

export default function TakeoverHosts({
  launchReveal: launchRevealOnMount,
  whatsNewSince,
}: Props) {
  const rootNavigation = useNavigation<RootStackNavigation>()

  const [launchReveal, setLaunchReveal] = useState(launchRevealOnMount)
  const [launchRevealId] = useState(() => newTakeoverId('update-reveal'))

  useLayoutEffect(() => {
    if (!launchReveal) return
    useTakeover.getState().seed('update-reveal', { id: launchRevealId })
    return () => useTakeover.getState().release(launchRevealId)
  }, [launchReveal, launchRevealId])

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

  const [whatsNewShown, setWhatsNewShown] = useState(false)
  if (whatsNew.active && !whatsNewShown) setWhatsNewShown(true)

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
      {}
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
