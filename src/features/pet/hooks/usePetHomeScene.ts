import { useEffect, useRef, useState } from 'react'
import { useIsFocused } from '@react-navigation/native'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import { createRng } from '@/lib/pixelArt'
import usePet from '@/stores/pet'
import type { PetRecord } from '@/types/pet'
import type { PlayerInput } from '@/features/pet/art'
import usePetLife from '@/features/pet/hooks/usePetLife'
import usePetSignData from '@/features/pet/hooks/usePetSignData'
import usePetWindow from '@/features/pet/hooks/usePetWindow'
import { shouldShowParadise, shouldShowStar } from '@/features/pet/lib/eggs'
import { moodMoment, petDisplayName } from '@/features/pet/lib/names'
import {
  cardLife,
  petSceneInput,
  type PetCardLife,
  type PetVisitRoll,
} from '@/features/pet/lib/sceneInput'
import { noteSecretFound } from '@/features/pet/lib/secrets'
import type { PetSceneHandle } from '@/features/pet/render/PetSceneView'
import {
  usePetSession,
  type PetVisitor,
} from '@/features/pet/stores/petSession'

/** Delay before the pet greets the User with its mood's sound. */
const GREET_DELAY_MS = 700
/** Spacing of the dev harness's pats. */
const DEV_PAT_MS = 120

export type PetHomeScene = {
  pet: PetRecord
  life: PetCardLife
  name: string
  input: PlayerInput
  sceneRef: React.RefObject<PetSceneHandle | null>
  /** Wakes a sleeping pet or one that died (the button or a tap). */
  wake: () => void
  collectGift: () => void
  onPat: () => void
  onTrick: () => void
}

/**
 * Everything the Home pet card draws and does: the replayed life (with the dev
 * override on top in dev builds), the room and sign, hidden moments rolled per
 * Home visit, entrances requested by the picker, and the dev harness's
 * commands. Null without a companion.
 */
export default function usePetHomeScene(
  visitor: PetVisitor | null | undefined
): PetHomeScene | null {
  const state = usePetLife()
  const override = usePetSession((s) => (__DEV__ ? s.devOverride : null))
  const command = usePetSession((s) => s.command)
  const entrancePending = usePetSession((s) => s.entrance !== null)
  const focused = useIsFocused()
  const today = useToday()
  const sign = usePetSignData(today)
  const window = usePetWindow(state.room.window)
  const sceneRef = useRef<PetSceneHandle>(null)
  const [roll, setRoll] = useState<PetVisitRoll>({
    paradise: false,
    star: false,
  })

  // Rolled once per Home visit (and when the sky changes), with a fresh seed.
  const { time, liveTime } = window
  useEffect(() => {
    if (!focused) return
    const rng = createRng(Date.now() % 2_147_483_647)
    const sky = { time, liveTime }
    setRoll({
      paradise: shouldShowParadise(rng, sky),
      star: shouldShowStar(rng, sky),
    })
  }, [focused, time, liveTime])

  // The dev harness's motions and pats, from after the card mounted.
  const handledCommand = useRef(usePetSession.getState().command?.id ?? 0)
  useEffect(() => {
    if (!__DEV__ || !command || command.id <= handledCommand.current) return
    handledCommand.current = command.id
    const scene = sceneRef.current
    if (!scene) return
    // Off screen, the entrance stays pending and plays when Home shows.
    if (command.kind === 'entrance') {
      if (focused)
        scene.playEntrance(usePetSession.getState().takeEntrance() ?? undefined)
    } else if (command.kind === 'trick') scene.playTrick()
    else if (command.kind === 'wake') scene.playWake()
    else if (command.kind === 'pat') {
      let left = command.count
      const timer = setInterval(() => {
        if (left-- <= 0) return clearInterval(timer)
        scene.pat()
      }, DEV_PAT_MS)
      return () => clearInterval(timer)
    }
  }, [command, focused])

  const pet = state.pet
  const life = pet && state.life ? cardLife(state.life, override) : null
  const scene =
    pet && life
      ? petSceneInput({
          pet,
          life,
          room: state.room,
          window,
          lampLevel: state.lampLevel,
          sign,
          pendingGift: state.pendingGift,
          keepsakes: pet.keepsakes,
          visitor,
          roll,
          override,
        })
      : null

  const hasPet = pet !== null
  const mood = life?.mood
  const moodNow = useRef(mood)
  useEffect(() => {
    moodNow.current = mood
  }, [mood])
  // An entrance the picker asked for plays once the card is on screen;
  // otherwise the pet greets the User with how it feels.
  useEffect(() => {
    if (!focused || !hasPet) return
    const species = usePetSession.getState().takeEntrance()
    if (species) {
      sceneRef.current?.playEntrance(species)
      return
    }
    const timer = setTimeout(() => {
      const moment = moodNow.current ? moodMoment(moodNow.current) : null
      if (moment) sceneRef.current?.say(moment)
    }, GREET_DELAY_MS)
    return () => clearTimeout(timer)
  }, [focused, hasPet])

  const shown = scene?.shown
  useEffect(() => {
    if (!shown || !focused) return
    if (shown.gold) noteSecretFound('gold')
    if (shown.rainbow) noteSecretFound('rainbow')
    if (shown.paradise) noteSecretFound('paradise')
    if (shown.star) noteSecretFound('star')
    if (shown.visitor) noteSecretFound('visitor')
  }, [shown, focused])

  const { unlockedItems, unlockMode, streakKind } = state
  useEffect(() => {
    if (!__DEV__) return
    usePetSession.getState().setDevSnapshot(
      scene && life
        ? {
            life,
            window,
            input: { ...scene.input, sign: undefined },
            sign,
            shown: scene.shown,
            roll,
            override,
            unlocks: {
              mode: unlockMode,
              streakKind,
              unlocked: [...unlockedItems].sort(),
            },
          }
        : null
    )
  }, [
    scene,
    life,
    window,
    sign,
    roll,
    override,
    unlockedItems,
    unlockMode,
    streakKind,
  ])

  useEffect(
    () => () => {
      if (__DEV__) usePetSession.getState().setDevSnapshot(null)
    },
    []
  )

  if (!pet || !life || !scene) return null

  const wake = () => {
    if (!life.dead && !life.asleep) return
    if (life.dead) sceneRef.current?.playWake()
    usePet.getState().recordWake(state.todayKey)
    // A faked state wakes too, so the harness can record the whole wake.
    const { devOverride, setDevOverride } = usePetSession.getState()
    if (
      __DEV__ &&
      devOverride &&
      (devOverride.dead || (devOverride.hearts ?? 1) < 1)
    ) {
      setDevOverride({
        ...devOverride,
        dead: false,
        hearts: Math.max(1, devOverride.hearts ?? 1),
      })
    }
    Haptics.success()
    analytics.capture('pet_woken', { from: life.dead ? 'died' : 'asleep' })
  }

  const collectGift = () => {
    const gift = state.pendingGift
    if (gift) usePet.getState().collectKeepsake(gift.kind, gift.on)
    if (__DEV__ && override && 'gift' in override) {
      const { setDevOverride } = usePetSession.getState()
      setDevOverride({
        ...override,
        gift: null,
        sill: [
          ...(override.sill ?? scene.input.moments?.sill ?? []),
          ...(override.gift ? [override.gift] : []),
        ].slice(-5),
      })
    }
    Haptics.success()
    noteSecretFound('gift')
  }

  return {
    pet,
    life,
    name: petDisplayName(pet),
    // Until its entrance plays, the pet stays out of the room: it walks in,
    // rather than showing at rest first (behind the closing picker, say).
    input: entrancePending ? { ...scene.input, pet: null } : scene.input,
    sceneRef,
    wake,
    collectGift,
    onPat: () => Haptics.light(),
    onTrick: () => noteSecretFound('trick'),
  }
}
