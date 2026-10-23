import { useEffect } from 'react'
import usePublisher from '@/hooks/usePublisher'
import useServiceStreak from '@/hooks/useServiceStreak'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import { petDisplayName } from '@/features/pet/lib/names'
import { announcePetUnlocks } from '@/features/pet/lib/unlockAnnounce'
import type { StreakKind } from '@/lib/serviceStreak'
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
import { localDayKey, monthOfDayKey } from '@/features/pet/lib/dayKeys'
import { pendingGift } from '@/features/pet/lib/gifts'
import { lampLevel, type LampLevel } from '@/features/pet/lib/lamp'
import { type PetLife } from '@/features/pet/lib/life'
import {
  petLifeOn,
  selectHeartsPace,
  selectPetActiveDays,
} from '@/features/pet/lib/petInputs'
import { defaultRoomFor, readPet, readRoom } from '@/features/pet/lib/records'
import {
  roomItemsEarnedBy,
  roomItemsToStore,
  storedRoomItems,
  unlockedRoomItems,
  unlockMode,
  type UnlockMode,
} from '@/features/pet/lib/unlocks'
import {
  isSecretItem,
  secretItemsEarnedBy,
} from '@/features/pet/lib/secretUnlocks'
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
const unlockedOf = lastResult(unlockedRoomItems)
/** The items earned now, the same list while the mode and count are. */
const earnedOf = lastResult(
  (mode: UnlockMode, kind: StreakKind, count: number, months: number) =>
    roomItemsEarnedBy(
      mode === 'streak' ? { mode, kind, count } : { mode, activeMonths: months }
    )
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
    mode: UnlockMode,
    kind: StreakKind,
    count: number,
    months: number,
    all: boolean
  ): RoomItemId[] =>
    all
      ? [...SECRET_ROOM_ITEMS]
      : secretItemsEarnedBy({
          badges: new Set(Object.keys(badges)),
          keepsakes,
          gold,
          streak: mode === 'streak' ? { kind, count } : null,
          activeMonths: months,
        })
)
const joinedOf = lastResult(
  (a: readonly RoomItemId[], b: readonly RoomItemId[]): RoomItemId[] =>
    b.length ? [...a, ...b] : (a as RoomItemId[])
)
const NOTHING_EARNED = unlockedRoomItems([], [])
const monthsOf = lastResult(activeMonths)
/** Whether this calendar month already has an active day since adoption. */
const thisMonthActiveOf = lastResult(
  (days: ReadonlySet<string>, adoptedOn: string, todayKey: string) => {
    const monthStart = `${monthOfDayKey(todayKey)}-01`
    const since = adoptedOn > monthStart ? adoptedOn : monthStart
    return activeMonths(days, since, todayKey) > 0
  }
)

export type PetLifeState = {
  /** The companion, or null before adoption (show the prompt card). */
  pet: PetRecord | null
  /** The room as shown: stored choices, defaults for the rest. */
  room: PetRoomSettings
  /** Defaults for `updateRoom` while the room was never customized. */
  roomDefaults: PetRoomSettings
  /** Hearts and moments replayed through today; null without a pet. */
  life: PetLife | null
  lampLevel: LampLevel
  /** Starters, the items stored as earned, and any earned now. */
  unlockedItems: ReadonlySet<string>
  /** How locked items open up now (`unlockMode`). */
  unlockMode: UnlockMode
  /** The Service Streak's kind, for the counts locked items open up at. */
  streakKind: StreakKind
  /** The keepsake waiting on the rug; collect with `collectKeepsake`. */
  pendingGift: { kind: GiftKind; on: string } | null
  /** Months with an active day since adoption (months mode). */
  activeMonths: number
  /** This month counts toward unlocks already (it has an active day). */
  thisMonthActive: boolean
  /** Today's local day key, for wakes and adoption. */
  todayKey: string
}

/**
 * The Pet Companion as Home shows it, from the pet store and the ministry
 * records it replays (ADR 0030). Moves on at midnight. Room items earned now
 * are stored on the pet once, so they stay unlocked.
 */
export default function usePetLife(): PetLifeState {
  const storedPet = usePet((state) => state.pet)
  const storedRoom = usePet((state) => state.room)
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const visits = useConversations((state) => state.conversations)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const role = usePreferences((state) => state.role)
  const earnedBadges = usePreferences((state) => state.earnedBadges)
  const roleHistory = usePreferences((state) => state.roleHistory)
  const { entryMode } = usePublisher()
  const streak = useServiceStreak()
  const todayKey = localDayKey(useToday())

  // Dev harness: a faked streak or revealed secrets show their unlocks without
  // storing them, and so does Developer Tools' streak override.
  const fakedStreak = usePetSession((s) =>
    __DEV__ ? s.devOverride?.streak : undefined
  )
  const fakedSecrets = usePetSession((s) =>
    __DEV__ ? s.devOverride?.secrets === true : false
  )
  const toolsStreak = usePreferences((state) => state.devStreakOverride)
  const faking =
    fakedStreak !== undefined || fakedSecrets || toolsStreak !== null

  const pet = petOf(storedPet)
  const roomDefaults = defaultRoomFor(entryMode)
  const room = roomOf(storedRoom, roomDefaults)
  const lamp = lampLevel(streak, showStreaks)
  const mode = unlockMode({ showStreaks })

  const activeDays = pet
    ? selectPetActiveDays({ serviceReports, visits, dayPlans, recurringPlans })
    : null
  const months =
    pet && activeDays ? monthsOf(activeDays, pet.adoptedOn, todayKey) : 0
  const stored = storedOf(pet)
  const life =
    pet && activeDays
      ? petLifeOn(
          pet,
          activeDays,
          todayKey,
          selectHeartsPace(roleHistory, role)
        )
      : null
  const count = fakedStreak ?? streak.count
  const earned =
    pet && life
      ? joinedOf(
          earnedOf(mode, streak.kind, count, months),
          secretsOf(
            earnedBadges,
            pet.keepsakes.length,
            life.gold,
            mode,
            streak.kind,
            count,
            months,
            fakedSecrets
          )
        )
      : []
  // Joined, so the effect only runs when the list to store changes.
  const toStore = faking ? '' : roomItemsToStore(stored, earned).join(' ')
  useEffect(() => {
    if (!toStore) return
    const { pet: before, earnRoomItems } = usePet.getState()
    // Home and Decorate Room can both ask; only the first adds anything.
    const added = earnRoomItems(toStore.split(' ') as RoomItemId[])
    for (const item of added)
      analytics.capture('pet_room_item_unlocked', {
        item,
        by: isSecretItem(item) ? 'secret' : mode,
      })
    // A new pet's items are the room it starts with, not news: whatever its
    // first day opens (streak items, then secrets as the rest settles).
    if (
      added.length &&
      before?.earnedRoomItems &&
      before.adoptedOn !== todayKey
    )
      announcePetUnlocks(added, petDisplayName(before))
  }, [toStore, mode, todayKey])

  if (!pet || !life)
    return {
      pet: null,
      room,
      roomDefaults,
      life: null,
      lampLevel: lamp,
      unlockedItems: NOTHING_EARNED,
      unlockMode: mode,
      streakKind: streak.kind,
      pendingGift: null,
      activeMonths: 0,
      thisMonthActive: false,
      todayKey,
    }

  return {
    pet,
    room,
    roomDefaults,
    life,
    lampLevel: lamp,
    unlockedItems: unlockedOf(stored, earned),
    unlockMode: mode,
    streakKind: streak.kind,
    pendingGift: pendingGift({ life, keepsakes: pet.keepsakes }),
    activeMonths: months,
    thisMonthActive: activeDays
      ? thisMonthActiveOf(activeDays, pet.adoptedOn, todayKey)
      : false,
    todayKey,
  }
}
