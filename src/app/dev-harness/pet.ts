import moment from 'moment'
import { keptKeepsakes, keptRoomItems } from '@/lib/petHistory'
import { getStreakKind } from '@/lib/publisherCapabilities'
import usePet from '@/stores/pet'
import { startReward, type RewardLine } from '@/stores/rewardStack'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { rewardIcon } from '@/features/pet/components/PetRewardChip'
import {
  COINS_PER_DAY,
  COINS_PER_MILESTONE,
  COINS_PER_PLAN_KEPT,
} from '@/features/pet/lib/currency'
import { earnedCounts, type EarnedCounts } from '@/features/pet/lib/rewardLines'
import { petEarningsNow } from '@/features/pet/lib/walletNow'
import i18n, { type TranslationKey } from '@/lib/locales'
import { petDisplayName } from '@/features/pet/lib/names'
import { announcePetUnlocks } from '@/features/pet/lib/unlockAnnounce'
import { usePetUnlockNews } from '@/features/pet/stores/petUnlockNews'
import {
  GIFT_KINDS,
  HAT_UNLOCK_ORDER,
  PET_KEEPSAKES_KEPT,
  SECRET_ROOM_ITEMS,
  UNLOCK_ORDER,
  type PetRecord,
  type RoomItemId,
} from '@/types/pet'
import { usePreferences } from '@/stores/preferences'
import {
  defaultCoatFor,
  isPetSpecies,
  SEASONS,
  TIMES_OF_DAY,
  type PetRoomSettings,
  type PetSpecies,
  type PetVisit,
  type PetVisitActivity,
} from '@/types/pet'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import { seenPetKey, type PetShown } from '@/features/pet/lib/reveal'
import { forgetFoundSecrets } from '@/features/pet/lib/secrets'
import { usePetSeen } from '@/features/pet/stores/petSeen'
import {
  usePetSession,
  type PetDevOverride,
} from '@/features/pet/stores/petSession'

const speciesOrThrow = (species: string): PetSpecies => {
  if (!isPetSpecies(species)) throw new Error(`Unknown species "${species}"`)
  return species
}

type DevVisitor = {
  species: PetSpecies
  coat?: string
  name?: string

  buddy?: string
  activity?: PetVisitActivity
}

const devVisit = (visitor: DevVisitor, i: number): PetVisit => ({
  inboxId: `dev-visitor-${i}`,
  buddyName: visitor.buddy ?? `Buddy ${i + 1}`,
  pet: {
    species: speciesOrThrow(visitor.species),
    coat: visitor.coat ?? defaultCoatFor(visitor.species),
    ...(visitor.name ? { name: visitor.name } : {}),
  },
  startMinutes: 540 + i * 30,
  activity: visitor.activity ?? { type: 'plan', planId: 'dev-visitor' },
})

const checkWindow = (window: PetDevOverride['window']) => {
  if (!window) return
  if (!TIMES_OF_DAY.includes(window.time))
    throw new Error(
      `Unknown time "${window.time}" (${TIMES_OF_DAY.join(', ')})`
    )
  if (!SEASONS.includes(window.season))
    throw new Error(`Unknown season "${window.season}" (${SEASONS.join(', ')})`)
}

function playEntranceSoon(species: PetSpecies) {
  const session = usePetSession.getState()
  session.requestEntrance(species)
  if (session.devSnapshot) session.send({ kind: 'entrance' })
}

const checkWallet = (wallet: PetDevOverride['wallet']) => {
  if (wallet === undefined) return
  if (!Number.isInteger(wallet) || wallet < 0)
    throw new Error(
      `Wallet takes a whole number of coins from 0, not "${wallet}"`
    )
}

function editPet(change: (pet: PetRecord) => PetRecord) {
  const { pet } = usePet.getState()
  if (!pet) throw new Error('No pet: adopt one first')
  usePet.setState({
    pet: { ...change(pet), updatedAt: Math.max(Date.now(), pet.updatedAt + 1) },
  })
}

const EVERY_ITEM: readonly RoomItemId[] = [
  ...UNLOCK_ORDER,
  ...HAT_UNLOCK_ORDER,
  ...SECRET_ROOM_ITEMS,
]

const SAMPLE_LINES = {
  time: (): RewardLine => ({
    amount: COINS_PER_DAY,
    label: i18n.t('pet.reward.timeAdded'),
    tone: 'base',
  }),
  kept: (): RewardLine => ({
    amount: COINS_PER_PLAN_KEPT,
    label: i18n.t('pet.reward.plansKept' as TranslationKey, { count: 1 }),
    tone: 'bonus',
  }),
  milestone: (count: number, celebration: boolean): RewardLine => ({
    amount: COINS_PER_MILESTONE,
    label: i18n.t('pet.reward.milestone', { count }),
    tone: 'milestone',
    celebration,
  }),
}

function state() {
  const { pet, room } = usePet.getState()
  const session = usePetSession.getState()
  return {
    pet,
    room,
    promptDismissed: usePreferences.getState().petPromptDismissed,
    override: session.devOverride,
    pendingEntrance: session.entrance,
    unlocks: {
      stored: pet?.earnedRoomItems ?? [],

      purchases: pet?.purchases ?? [],

      current: session.devSnapshot?.unlocks ?? null,
    },

    card: session.devSnapshot,
  }
}

export const petHarness = {
  adopt: (species: string, coat?: string, name?: string) => {
    const id = speciesOrThrow(species)
    const store = usePet.getState()
    if (store.pet) store._WARNING_forceDeletePet()
    usePet.getState().adopt({
      species: id,
      coat: coat ?? defaultCoatFor(id),
      name,
      today: localDayKey(),
    })
    playEntranceSoon(id)
    return state()
  },

  setAppearance: (species: string, coat?: string) => {
    const id = speciesOrThrow(species)
    usePet
      .getState()
      .changeAppearance({ species: id, coat: coat ?? defaultCoatFor(id) })
    playEntranceSoon(id)
    return state()
  },
  rename: (name?: string) => {
    usePet.getState().rename(name)
    return state()
  },

  setRoom: (partial: Partial<PetRoomSettings>) => {
    usePet.getState().updateRoom(partial)
    return state()
  },

  release: () => {
    usePet.getState().releaseCompanion()
    usePetSession.getState().setDevOverride(null)
    usePetSession.getState().takeEntrance()
    return state()
  },

  resetPrompt: () => {
    usePreferences.getState().set({ petPromptDismissed: false })
    return state()
  },

  override: (
    patch: Omit<PetDevOverride, 'visits'> & {
      visitors?: DevVisitor[] | null
    }
  ) => {
    checkWindow(patch.window)
    checkWallet(patch.wallet)
    const { visitors, ...rest } = patch
    const { devOverride, setDevOverride } = usePetSession.getState()
    setDevOverride({
      ...devOverride,
      ...rest,
      ...(visitors !== undefined && {
        visits: visitors && visitors.map(devVisit),
      }),
    })
    return state()
  },
  clearOverride: () => {
    usePetSession.getState().setDevOverride(null)
    return state()
  },

  play: (kind: 'entrance' | 'trick' | 'twirl' | 'wake' | 'cheer') => {
    usePetSession.getState().send({ kind })
    return kind
  },

  pat: (count = 1) => {
    usePetSession.getState().send({ kind: 'pat', count })
    return count
  },

  scrub: (ms = 3000) => {
    usePetSession.getState().send({ kind: 'scrub', ms })
    return ms
  },

  forgetSecrets: () => {
    forgetFoundSecrets()
    return true
  },

  unlock: (items: string[]) => {
    const pet = usePet.getState().pet
    if (!pet) throw new Error('No pet: adopt one first')
    announcePetUnlocks(items as RoomItemId[], petDisplayName(pet))
    return usePetUnlockNews.getState().unseen
  },

  keepsakes: (on: boolean) => {
    const today = moment()
    editPet((pet) => ({
      ...pet,
      keepsakes: on
        ? keptKeepsakes(
            Array.from({ length: PET_KEEPSAKES_KEPT }, (_, i) => ({
              kind: GIFT_KINDS[i % GIFT_KINDS.length],
              on: today.clone().subtract(i, 'days').format('YYYY-MM-DD'),
            }))
          )
        : [],
    }))
    return usePet.getState().pet?.keepsakes.length ?? 0
  },

  items: (on: boolean) => {
    editPet((pet) => ({
      ...pet,
      earnedRoomItems: on ? keptRoomItems(EVERY_ITEM) : [],
      purchases: on ? pet.purchases : undefined,
    }))
    return usePet.getState().pet?.earnedRoomItems?.length ?? 0
  },

  refund: () => {
    editPet((pet) => ({ ...pet, purchases: undefined }))
    return true
  },

  reward: (kind: 'soft' | 'save' | 'milestone') => {
    const wallet = petEarningsNow()?.wallet ?? 0
    const lines =
      kind === 'soft'
        ? [SAMPLE_LINES.time()]
        : kind === 'save'
          ? [SAMPLE_LINES.time(), SAMPLE_LINES.kept()]
          : [
              SAMPLE_LINES.time(),
              SAMPLE_LINES.kept(),
              SAMPLE_LINES.milestone(10, true),
            ]
    const gain = lines.reduce((sum, line) => sum + line.amount, 0)
    const run = startReward({
      slot: 'toast',
      lines,
      count: { from: wallet, to: wallet + gain },
      icon: rewardIcon,
      announcement: `+${gain}`,
    })
    if (run !== null && kind === 'milestone') {
      const { role } = usePreferences.getState()
      useStreakCelebration.setState({
        celebrating: { count: 10, kind: getStreakKind(role) },
      })
    }
    return run
  },

  awayFor: (days = 3) => {
    const pet = usePet.getState().pet
    const now = petEarningsNow()
    if (!pet || !now) throw new Error('No pet: adopt one first')
    const counts = earnedCounts(now.earned)
    const before: EarnedCounts = {
      ...counts,
      daysOut: Math.max(0, counts.daysOut - days),
      plansKept: Math.max(0, counts.plansKept - days),
      milestones: Math.max(0, counts.milestones - 1),
    }
    const less =
      (counts.daysOut - before.daysOut) * COINS_PER_DAY +
      (counts.plansKept - before.plansKept) * COINS_PER_PLAN_KEPT +
      (counts.milestones - before.milestones) * COINS_PER_MILESTONE
    const { seen } = usePetSeen.getState()
    usePetSeen.getState().markSeen({
      pet: seenPetKey(pet),
      coins: Math.max(0, now.wallet - less),
      hearts: seen?.hearts ?? 5,
      earned: before,
    })
    return usePetSeen.getState().seen
  },

  seenNow: () => {
    const pet = usePet.getState().pet
    const now = petEarningsNow()
    if (!pet || !now) throw new Error('No pet: adopt one first')
    const { seen } = usePetSeen.getState()
    usePetSeen.getState().markSeen({
      pet: seenPetKey(pet),
      coins: now.wallet,
      hearts: seen?.hearts ?? 5,
      earned: earnedCounts(now.earned),
    })
    return usePetSeen.getState().seen
  },

  unlockNews: () => usePetUnlockNews.getState().unseen,

  seen: (shown?: Partial<PetShown> | null) => {
    const { seen, markSeen } = usePetSeen.getState()
    if (shown === undefined) return seen
    if (shown === null) {
      usePetSeen.setState({ seen: null })
      return null
    }
    const pet = usePet.getState().pet
    if (!pet) throw new Error('No pet: adopt one first')
    const key = seenPetKey(pet)
    const base = seen?.pet === key ? seen : { coins: 0, hearts: 3 }
    markSeen({
      coins: shown.coins ?? base.coins,
      hearts: shown.hearts ?? base.hearts,
      pet: key,
    })
    return usePetSeen.getState().seen
  },
  state,
}
