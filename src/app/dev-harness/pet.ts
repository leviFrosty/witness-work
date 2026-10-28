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

/** A made-up visiting pet for the harness. */
type DevVisitor = {
  species: PetSpecies
  coat?: string
  name?: string
  /** The buddy's name. */
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

/** Rejects a faked window the scene has no art for. */
const checkWindow = (window: PetDevOverride['window']) => {
  if (!window) return
  if (!TIMES_OF_DAY.includes(window.time))
    throw new Error(
      `Unknown time "${window.time}" (${TIMES_OF_DAY.join(', ')})`
    )
  if (!SEASONS.includes(window.season))
    throw new Error(`Unknown season "${window.season}" (${SEASONS.join(', ')})`)
}

/** Plays the entrance now if the Home card is up, else when it shows. */
function playEntranceSoon(species: PetSpecies) {
  const session = usePetSession.getState()
  session.requestEntrance(species)
  if (session.devSnapshot) session.send({ kind: 'entrance' })
}

/** Rejects a faked wallet the Shop can't read. */
const checkWallet = (wallet: PetDevOverride['wallet']) => {
  if (wallet === undefined) return
  if (!Number.isInteger(wallet) || wallet < 0)
    throw new Error(
      `Wallet takes a whole number of coins from 0, not "${wallet}"`
    )
}

/** Edits the companion as a real change would: restamped, so it syncs. */
function editPet(change: (pet: PetRecord) => PetRecord) {
  const { pet } = usePet.getState()
  if (!pet) throw new Error('No pet: adopt one first')
  usePet.setState({
    pet: { ...change(pet), updatedAt: Math.max(Date.now(), pet.updatedAt + 1) },
  })
}

/** Every item that can open up: the Shop's, then the secrets. */
const EVERY_ITEM: readonly RoomItemId[] = [
  ...UNLOCK_ORDER,
  ...HAT_UNLOCK_ORDER,
  ...SECRET_ROOM_ITEMS,
]

/** Lines for `reward()`, as real saves would make them. */
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

/** What the store holds, plus what the Home card last drew. */
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
      // Found secrets and items earned before the Shop, stored on the pet.
      stored: pet?.earnedRoomItems ?? [],
      // Shop purchases, with what each cost.
      purchases: pet?.purchases ?? [],
      // `{ wallet, unlocked }` as the Home card last worked them out; null
      // while it isn't mounted.
      current: session.devSnapshot?.unlocks ?? null,
    },
    // Null while the Home card isn't mounted (no pet, or Home not rendered).
    card: session.devSnapshot,
  }
}

/**
 * `__WW_DEV__.pet` (dev builds only): set up the companion and fake any life
 * state or hidden moment on the Home card, then play its motions, so every
 * animation can be recorded. See
 * `.agents/skills/verify-witnesswork/features/pet.md`.
 */
export const petHarness = {
  /** Adopts (or replaces) the companion today, and asks for its entrance. */
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
  /** Change Pet, with its entrance. */
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
  /** Room choices, e.g. `{ floor: 'stone', window: { time: 'night' } }`. */
  setRoom: (partial: Partial<PetRoomSettings>) => {
    usePet.getState().updateRoom(partial)
    return state()
  },
  /** Releases the companion (and its room) everywhere, like the real action. */
  release: () => {
    usePet.getState().releaseCompanion()
    usePetSession.getState().setDevOverride(null)
    usePetSession.getState().takeEntrance()
    return state()
  },
  /** Brings the Home prompt back. */
  resetPrompt: () => {
    usePreferences.getState().set({ petPromptDismissed: false })
    return state()
  },
  /**
   * Fakes life and moments on top of the real ones, merged into any earlier
   * override: `hearts`, `dead`, `gold`, `goldStartedToday`, `rainbow`,
   * `lampLevel`, `wallet` (coins earned, as if from records; what's bought
   * still comes off and is stored), `secrets` (true opens every secret item;
   * shown, never stored), `paradise`, `star`, `gift` (`olive`… or null),
   * `sill`, `window` (`{ time, season }`), `visitors` (buddies' pets visiting
   * in place of today's real ones: each `{ species, coat?, name?, buddy?,
   * activity? }`, made-up buddies and a made-up Plan filled in; `[]` for none,
   * null for the real ones).
   */
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
  /**
   * Plays a motion on the Home card (Home must be on screen): `cheer` is the
   * hearts-went-up burst.
   */
  play: (kind: 'entrance' | 'trick' | 'twirl' | 'wake' | 'cheer') => {
    usePetSession.getState().send({ kind })
    return kind
  },
  /** Pats the pet `count` times, 120 ms apart (15 plays the trick). */
  pat: (count = 1) => {
    usePetSession.getState().send({ kind: 'pat', count })
    return count
  },
  /** Rubs the pet every 100 ms for `ms` in one drag (2 s twirls it). */
  scrub: (ms = 3000) => {
    usePetSession.getState().send({ kind: 'scrub', ms })
    return ms
  },
  /** Lets every hidden moment send `pet_secret_found` again. */
  forgetSecrets: () => {
    forgetFoundSecrets()
    return true
  },
  /**
   * Items opening up now (`['hat:beret', 'floor:stone']`), under the action
   * rule: unlock toasts within 15 s of `noteUserAction()`, the tray otherwise.
   * Stores nothing on the pet; the news is real until settled.
   */
  unlock: (items: string[]) => {
    const pet = usePet.getState().pet
    if (!pet) throw new Error('No pet: adopt one first')
    announcePetUnlocks(items as RoomItemId[], petDisplayName(pet))
    return usePetUnlockNews.getState().unseen
  },
  /**
   * Fills the shelf with keepsakes, one a day back from today, every kind in
   * turn (`on`), or empties it. Synced like collecting one.
   */
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
  /**
   * Owns every hat and room item, secrets too, as earned so nothing is spent
   * (`on`), or locks every one again: nothing earned or bought, only the
   * starters. Synced.
   */
  items: (on: boolean) => {
    editPet((pet) => ({
      ...pet,
      earnedRoomItems: on ? keptRoomItems(EVERY_ITEM) : [],
      purchases: on ? pet.purchases : undefined,
    }))
    return usePet.getState().pet?.earnedRoomItems?.length ?? 0
  },
  /** Takes back every Shop purchase, so what they cost is to spend again. */
  refund: () => {
    editPet((pet) => ({ ...pet, purchases: undefined }))
    return true
  },
  /**
   * Plays the reward stack as a save would: `soft` (+1, nothing stomps), `save`
   * (+1 Time added, +1 Planned day kept), `milestone` (those, then +10 in the
   * streak celebration it opens). Nothing is earned.
   */
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
  /**
   * Makes the Home card play what was earned elsewhere the next time it shows:
   * this device last saw `days` fewer days out, as many fewer planned days
   * kept, and one milestone fewer when there is one (`back after a few days`).
   */
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
  /**
   * Marks the wallet and what earned it as shown on this device, so nothing
   * plays until the next change. Hearts stay as they were seen.
   */
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
  /** The unlock news the tray lists, oldest first. */
  unlockNews: () => usePetUnlockNews.getState().unseen,
  /**
   * What this device last showed of the pet's hearts and wallet (`petSeen`).
   * Given values, sets them, so the next time the Home card, Decorate Room or
   * the Shop is on screen it plays the change to now: `seen({ coins: 42,
   * hearts: 3.5 })`. `null` forgets it (the next sight starts from now).
   */
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
