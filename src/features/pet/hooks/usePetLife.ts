import { useEffect } from 'react'
import usePublisher from '@/hooks/usePublisher'
import useServiceStreak from '@/hooks/useServiceStreak'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import type { StreakKind } from '@/lib/serviceStreak'
import useConversations from '@/stores/conversationStore'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type {
  GiftKind,
  PetRecord,
  PetRoomRecord,
  PetRoomSettings,
  RoomItemId,
} from '@/types/pet'
import { activeMonths } from '@/features/pet/lib/activity'
import { localDayKey, monthOfDayKey } from '@/features/pet/lib/dayKeys'
import { pendingGift } from '@/features/pet/lib/gifts'
import { lampLevel, type LampLevel } from '@/features/pet/lib/lamp'
import { type PetLife } from '@/features/pet/lib/life'
import { petLifeOn, selectPetActiveDays } from '@/features/pet/lib/petInputs'
import { defaultRoomFor, readPet, readRoom } from '@/features/pet/lib/records'
import {
  roomItemsEarnedBy,
  roomItemsToStore,
  storedRoomItems,
  unlockedRoomItems,
  unlockMode,
  type UnlockMode,
} from '@/features/pet/lib/unlocks'
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
  const { entryMode } = usePublisher()
  const streak = useServiceStreak()
  const todayKey = localDayKey(useToday())

  // Dev harness: a faked streak shows its unlocks without storing them.
  const fakedStreak = usePetSession((s) =>
    __DEV__ ? s.devOverride?.streak : undefined
  )

  const pet = petOf(storedPet)
  const roomDefaults = defaultRoomFor(entryMode)
  const room = roomOf(storedRoom, roomDefaults)
  const lamp = lampLevel(streak, showStreaks)
  const mode = unlockMode({
    showStreaks,
    kind: streak.kind,
    hasPlans:
      dayPlans.length > 0 ||
      recurringPlans.length > 0 ||
      fakedStreak !== undefined,
  })

  const activeDays = pet
    ? selectPetActiveDays({ serviceReports, visits, dayPlans, recurringPlans })
    : null
  const months =
    pet && activeDays ? monthsOf(activeDays, pet.adoptedOn, todayKey) : 0
  const stored = storedOf(pet)
  const earned = pet
    ? earnedOf(mode, streak.kind, fakedStreak ?? streak.count, months)
    : []
  // Joined, so the effect only runs when the list to store changes.
  const toStore =
    fakedStreak === undefined ? roomItemsToStore(stored, earned).join(' ') : ''
  useEffect(() => {
    if (!toStore) return
    // Home and Decorate Room can both ask; only the first adds anything.
    const added = usePet
      .getState()
      .earnRoomItems(toStore.split(' ') as RoomItemId[])
    for (const item of added)
      analytics.capture('pet_room_item_unlocked', { item, by: mode })
  }, [toStore, mode])

  if (!pet || !activeDays)
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

  const life = petLifeOn(pet, activeDays, todayKey)
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
    thisMonthActive: thisMonthActiveOf(activeDays, pet.adoptedOn, todayKey),
    todayKey,
  }
}
