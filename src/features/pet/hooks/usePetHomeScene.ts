import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import type { View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import usePublisher from '@/hooks/usePublisher'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import { createRng } from '@/lib/pixelArt'
import usePet from '@/stores/pet'
import type { PetRecord, PetVisit } from '@/types/pet'
import type { PlayerInput } from '@/features/pet/art'
import { lampLevel } from '@/features/pet/lib/lamp'
import { sameShown, seenPetKey, shownBefore } from '@/features/pet/lib/reveal'
import { rewardIcon } from '@/features/pet/components/PetRewardChip'
import usePetLife from '@/features/pet/hooks/usePetLife'
import usePetReveal, { type PetReveal } from '@/features/pet/hooks/usePetReveal'
import useRevealVisible from '@/features/pet/hooks/useRevealVisible'
import usePetSignData from '@/features/pet/hooks/usePetSignData'
import usePetWindow from '@/features/pet/hooks/usePetWindow'
import { shouldShowParadise, shouldShowStar } from '@/features/pet/lib/eggs'
import { moodMoment, petDisplayName } from '@/features/pet/lib/names'
import {
  cardLife,
  petSceneInput,
  withShownHearts,
  type PetCardLife,
  type PetVisitRoll,
} from '@/features/pet/lib/sceneInput'
import {
  noteSecretFound,
  roomItemsPickedSnapshot,
  subscribeRoomItemsPicked,
} from '@/features/pet/lib/secrets'
import { hasNewRoomItem } from '@/features/pet/lib/locker'
import type { PetSceneHandle } from '@/features/pet/render/PetSceneView'
import { usePetSeen } from '@/features/pet/stores/petSeen'
import { usePetSession } from '@/features/pet/stores/petSession'

const GREET_DELAY_MS = 700

const DEV_PAT_MS = 120

const DEV_SCRUB_MS = 100

export type PetHomeScene = {
  pet: PetRecord

  visits: readonly PetVisit[]

  life: PetCardLife

  reveal: PetReveal
  name: string

  hasNewItems: boolean
  input: PlayerInput
  sceneRef: React.RefObject<PetSceneHandle | null>

  wake: () => void
  collectGift: () => void
  onPat: () => void
  onTrick: () => void
  onTwirl: () => void
}

export default function usePetHomeScene(
  realVisits: readonly PetVisit[],
  revealRef: RefObject<View | null>
): PetHomeScene | null {
  const state = usePetLife()
  const override = usePetSession((s) => (__DEV__ ? s.devOverride : null))
  const visits = override?.visits ?? realVisits
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

  const handledCommand = useRef(usePetSession.getState().command?.id ?? 0)
  useEffect(() => {
    if (!__DEV__ || !command || command.id <= handledCommand.current) return
    handledCommand.current = command.id
    const scene = sceneRef.current
    if (!scene) return

    if (command.kind === 'entrance') {
      if (focused)
        scene.playEntrance(usePetSession.getState().takeEntrance() ?? undefined)
    } else if (command.kind === 'trick') scene.playTrick()
    else if (command.kind === 'twirl') scene.playTwirl()
    else if (command.kind === 'wake') scene.playWake()
    else if (command.kind === 'cheer') scene.cheer()
    else if (command.kind === 'scrub') {
      const end = performance.now() + command.ms
      const timer = setInterval(() => {
        if (performance.now() > end) {
          scene.endRub()
          return clearInterval(timer)
        }
        scene.rub()
      }, DEV_SCRUB_MS)
      return () => {
        clearInterval(timer)
        scene.endRub()
      }
    } else if (command.kind === 'pat') {
      let left = command.count
      const timer = setInterval(() => {
        if (left-- <= 0) return clearInterval(timer)
        scene.pat()
      }, DEV_PAT_MS)
      return () => clearInterval(timer)
    }
  }, [command, focused])

  const pet = state.pet
  const realLife = pet && state.life ? cardLife(state.life, override) : null

  const seenKey = pet ? seenPetKey(pet) : null
  const now = { coins: state.wallet, hearts: realLife?.hearts ?? 0 }
  const adoptedToday = pet?.adoptedOn === state.todayKey
  const pending = usePetSeen(
    ({ seen }) =>
      seenKey !== null &&
      !sameShown(shownBefore(seen, seenKey, now, adoptedToday), now)
  )
  const { streakKind } = usePublisher()
  const reveal = usePetReveal({
    pet: seenKey,
    now,
    earned: state.earnings,
    adoptedToday,
    visible: useRevealVisible(revealRef, pending),
    flights: true,
    stack: { streakKind, icon: rewardIcon },
  })
  const shownHearts = reveal.shown.hearts
  const life = withShownHearts(realLife, shownHearts)

  const scene =
    pet && life
      ? petSceneInput({
          pet,
          life,
          room: state.room,
          window,

          lampLevel: lampLevel(life),
          sign,
          pendingGift: state.pendingGift,
          keepsakes: pet.keepsakes,
          visits,
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

  const filled = reveal.heart?.up === true && shownHearts === realLife?.hearts
  useEffect(() => {
    if (!filled) return
    const timer = setTimeout(() => sceneRef.current?.cheer(), 150)
    return () => clearTimeout(timer)
  }, [filled])

  const shown = scene?.shown
  useEffect(() => {
    if (!shown || !focused) return
    if (shown.gold) noteSecretFound('gold')
    if (shown.rainbow) noteSecretFound('rainbow')
    if (shown.paradise) noteSecretFound('paradise')
    if (shown.star) noteSecretFound('star')
    if (shown.visitor) noteSecretFound('visitor')
  }, [shown, focused])

  const { unlockedItems, wallet } = state

  const picked = useSyncExternalStore(
    subscribeRoomItemsPicked,
    roomItemsPickedSnapshot
  )
  const hasNewItems = hasNewRoomItem(state.room, unlockedItems, picked)
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
              wallet,
              unlocked: [...unlockedItems].sort(),
            },
          }
        : null
    )
  }, [scene, life, window, sign, roll, override, unlockedItems, wallet])

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
    visits,
    life,
    reveal,
    name: petDisplayName(pet),
    hasNewItems,

    input: entrancePending ? { ...scene.input, pet: null } : scene.input,
    sceneRef,
    wake,
    collectGift,
    onPat: () => Haptics.light(),
    onTrick: () => noteSecretFound('trick'),
    onTwirl: () => noteSecretFound('twirl'),
  }
}
