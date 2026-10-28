import { useEffect } from 'react'
import usePublisher from '@/hooks/usePublisher'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import { streakHistoryFor } from '@/lib/currentServiceStreak'
import { petDisplayName } from '@/features/pet/lib/names'
import { announcePetUnlocks } from '@/features/pet/lib/unlockAnnounce'
import useConversations from '@/stores/conversationStore'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import {
  SECRET_ROOM_ITEMS,
  type GiftKind,
  type PetRecord,
  type PetRoomRecord,
  type PetRoomSettings,
  type RoomItemId,
} from '@/types/pet'
import { activeMonths } from '@/features/pet/lib/activity'
import {
  coinsOf,
  NO_EARNINGS,
  petDaysOut,
  petEarned,
  spentOn,
  walletOf,
  type Earned,
} from '@/features/pet/lib/currency'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import { pendingGift } from '@/features/pet/lib/gifts'
import { lampLevel, type LampLevel } from '@/features/pet/lib/lamp'
import { START_HEARTS, type PetLife } from '@/features/pet/lib/life'
import {
  petLifeOn,
  selectHeartsPace,
  selectPetActiveDays,
} from '@/features/pet/lib/petInputs'
import { defaultRoomFor, readPet, readRoom } from '@/features/pet/lib/records'
import {
  roomItemsToStore,
  storedPurchases,
  storedRoomItems,
  unlockedRoomItems,
} from '@/features/pet/lib/unlocks'
import { secretItemsEarnedBy } from '@/features/pet/lib/secretUnlocks'
import { usePetSession } from '@/features/pet/stores/petSession'

/**
 * Keeps the last result while every argument is the same value or object, so a
 * render with unchanged records skips the work and returns the same objects.
 */
function lastResult<A extends unknown[], R>(fn: (...args: A) => R) {
  let last: { args: A; result: R } | null = null
  return (...args: A): R => {
    if (
      last &&
      last.args.length === args.length &&
      last.args.every((arg, i) => Object.is(arg, args[i]))
    )
      return last.result
    const result = fn(...args)
    last = { args, result }
    return result
  }
}

const petOf = lastResult((pet: PetRecord | null) => (pet ? readPet(pet) : null))
const roomOf = lastResult(
  (room: PetRoomRecord | null, defaults: PetRoomSettings) =>
    readRoom(room, defaults)
)
const storedOf = lastResult(storedRoomItems)
const purchasesOf = lastResult(storedPurchases)
const unlockedOf = lastResult(unlockedRoomItems)
const daysOutOf = lastResult(
  (
    serviceReports: Parameters<typeof petDaysOut>[0]['serviceReports'],
    visits: Parameters<typeof petDaysOut>[0]['visits']
  ) => petDaysOut({ serviceReports, visits })
)
const historyOf = lastResult(
  (
    role: Parameters<typeof streakHistoryFor>[0]['role'],
    roleHistory: Parameters<typeof streakHistoryFor>[0]['roleHistory'],
    serviceReports: Parameters<typeof streakHistoryFor>[1]['serviceReports'],
    dayPlans: Parameters<typeof streakHistoryFor>[1]['dayPlans'],
    recurringPlans: Parameters<typeof streakHistoryFor>[1]['recurringPlans'],
    now: Date
  ) =>
    streakHistoryFor(
      { role, roleHistory },
      { serviceReports, dayPlans, recurringPlans },
      now
    )
)
const earnedOf = lastResult(
  (
    daysOut: ReturnType<typeof petDaysOut>,
    history: ReturnType<typeof streakHistoryFor>,
    streaks: boolean,
    adoptedOn: string,
    today: string,
    paceOf: ReturnType<typeof selectHeartsPace>
  ): Earned =>
    petEarned({ daysOut, history, streaks, adoptedOn, today, paceOf })
)
/**
 * The secret items earned now (`secretItemsEarnedBy`), the same list while what
 * their rules read is.
 */
const secretsOf = lastResult(
  (
    badges: Readonly<Record<string, unknown>>,
    keepsakes: number,
    gold: boolean,
    monthsOut: number,
    all: boolean
  ): RoomItemId[] =>
    all
      ? [...SECRET_ROOM_ITEMS]
      : secretItemsEarnedBy({
          badges: new Set(Object.keys(badges)),
          keepsakes,
          gold,
          monthsOut,
        })
)
const NOTHING_EARNED = unlockedRoomItems([], [])
/** The lamp before there's a life to follow: a new pet's hearts. */
const NO_LIFE_LAMP = lampLevel({ hearts: START_HEARTS, dead: false })

export type PetLifeState = {
  /** The companion, or null before adoption (show the prompt card). */
  pet: PetRecord | null
  /** The room as shown: stored choices, defaults for the rest. */
  room: PetRoomSettings
  /** Defaults for `updateRoom` while the room was never customized. */
  roomDefaults: PetRoomSettings
  /** Hearts and moments replayed through today; null without a pet. */
  life: PetLife | null
  /** The lamp follows the hearts (ADR 0035). */
  lampLevel: LampLevel
  /** Starters, stored and bought items, and secrets earned now. */
  unlockedItems: ReadonlySet<string>
  /** Coins earned since adoption, by what earned them (ADR 0035). */
  earnings: Earned
  /** The coins they add up to. */
  earned: number
  /** The coins left of them to spend in the Shop. */
  wallet: number
  /** Hearts fill by the month this month (ADR 0031): a monthly reporter. */
  monthlyHearts: boolean
  /** The keepsake waiting on the rug; collect with `collectKeepsake`. */
  pendingGift: { kind: GiftKind; on: string } | null
  /** Today's local day key, for wakes and adoption. */
  todayKey: string
}

/**
 * The Pet Companion as Home shows it, from the pet store and the ministry
 * records it replays (ADR 0030): hearts, and the coins the Shop takes (ADR
 * 0035). Moves on at midnight. Secret items found now are stored on the pet
 * once, so they stay unlocked.
 */
export default function usePetLife(): PetLifeState {
  const storedPet = usePet((state) => state.pet)
  const storedRoom = usePet((state) => state.room)
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const visits = useConversations((state) => state.conversations)
  const role = usePreferences((state) => state.role)
  const earnedBadges = usePreferences((state) => state.earnedBadges)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const roleHistory = usePreferences((state) => state.roleHistory)
  const { entryMode } = usePublisher()
  const today = useToday()
  const todayKey = localDayKey(today)

  // Dev harness: a faked wallet or revealed secrets show without being stored.
  const fakedWallet = usePetSession((s) =>
    __DEV__ ? s.devOverride?.wallet : undefined
  )
  const fakedSecrets = usePetSession((s) =>
    __DEV__ ? s.devOverride?.secrets === true : false
  )

  const pet = petOf(storedPet)
  const roomDefaults = defaultRoomFor(entryMode)
  const room = roomOf(storedRoom, roomDefaults)
  const monthlyHearts = entryMode === 'checkbox'

  const activeDays = pet
    ? selectPetActiveDays({ serviceReports, visits, dayPlans, recurringPlans })
    : null
  const paceOf = selectHeartsPace(roleHistory, role)
  const stored = storedOf(pet)
  const purchases = purchasesOf(pet)
  const life =
    pet && activeDays ? petLifeOn(pet, activeDays, todayKey, paceOf) : null
  const daysOut = pet ? daysOutOf(serviceReports, visits) : null
  const earnings =
    pet && life && daysOut
      ? earnedOf(
          daysOut,
          historyOf(
            role,
            roleHistory,
            serviceReports,
            dayPlans,
            recurringPlans,
            today
          ),
          showStreaks,
          pet.adoptedOn,
          todayKey,
          paceOf
        )
      : NO_EARNINGS
  const earned = pet && life ? (fakedWallet ?? coinsOf(earnings)) : 0
  const secrets =
    pet && life
      ? secretsOf(
          earnedBadges,
          pet.keepsakes.length,
          life.gold,
          daysOut ? activeMonths(daysOut.days, pet.adoptedOn, todayKey) : 0,
          fakedSecrets
        )
      : []
  // Joined, so the effect only runs when the list to store changes.
  const toStore = fakedSecrets
    ? ''
    : roomItemsToStore(stored, secrets).join(' ')
  useEffect(() => {
    if (!toStore) return
    const { pet: before, earnRoomItems } = usePet.getState()
    // Home and Decorate Room can both ask; only the first adds anything.
    const added = earnRoomItems(toStore.split(' ') as RoomItemId[])
    for (const item of added)
      analytics.capture('pet_room_item_unlocked', { item, by: 'secret' })
    // A new pet's items are the room it starts with, not news: whatever its
    // first day opens.
    if (
      added.length &&
      before?.earnedRoomItems &&
      before.adoptedOn !== todayKey
    )
      announcePetUnlocks(added, petDisplayName(before))
  }, [toStore, todayKey])

  if (!pet || !life)
    return {
      pet: null,
      room,
      roomDefaults,
      life: null,
      lampLevel: NO_LIFE_LAMP,
      unlockedItems: NOTHING_EARNED,
      earnings: NO_EARNINGS,
      earned: 0,
      wallet: 0,
      monthlyHearts,
      pendingGift: null,
      todayKey,
    }

  return {
    pet,
    room,
    roomDefaults,
    life,
    lampLevel: lampLevel(life),
    unlockedItems: unlockedOf(stored, secrets, purchases),
    earnings,
    earned,
    wallet: walletOf(earned, spentOn(purchases)),
    monthlyHearts,
    pendingGift: pendingGift({ life, keepsakes: pet.keepsakes }),
    todayKey,
  }
}
