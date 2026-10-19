import usePublisher from '@/hooks/usePublisher'
import useServiceStreak from '@/hooks/useServiceStreak'
import useToday from '@/hooks/useToday'
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
import { unlockedRoomItems } from '@/features/pet/lib/unlocks'

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
const unlockedOf = lastResult(unlockedRoomItems)
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
  unlockedItems: ReadonlySet<RoomItemId>
  /** The keepsake waiting on the rug; collect with `collectKeepsake`. */
  pendingGift: { kind: GiftKind; on: string } | null
  /** Months with an active day since adoption. */
  activeMonths: number
  /** This month counts toward unlocks already (it has an active day). */
  thisMonthActive: boolean
  /** Today's local day key, for wakes and adoption. */
  todayKey: string
}

/**
 * The Pet Companion as Home shows it, from the pet store and the ministry
 * records it replays (ADR 0030). Moves on at midnight.
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

  const pet = petOf(storedPet)
  const roomDefaults = defaultRoomFor(entryMode)
  const room = roomOf(storedRoom, roomDefaults)
  const lamp = lampLevel(streak, showStreaks)

  if (!pet)
    return {
      pet: null,
      room,
      roomDefaults,
      life: null,
      lampLevel: lamp,
      unlockedItems: unlockedOf(0),
      pendingGift: null,
      activeMonths: 0,
      thisMonthActive: false,
      todayKey,
    }

  const activeDays = selectPetActiveDays({
    serviceReports,
    visits,
    dayPlans,
    recurringPlans,
  })
  const life = petLifeOn(pet, activeDays, todayKey)
  const months = monthsOf(activeDays, pet.adoptedOn, todayKey)
  return {
    pet,
    room,
    roomDefaults,
    life,
    lampLevel: lamp,
    unlockedItems: unlockedOf(months),
    pendingGift: pendingGift({ life, keepsakes: pet.keepsakes }),
    activeMonths: months,
    thisMonthActive: thisMonthActiveOf(activeDays, pet.adoptedOn, todayKey),
    todayKey,
  }
}
