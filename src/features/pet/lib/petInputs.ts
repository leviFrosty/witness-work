import type { PetRecord } from '@/types/pet'
import {
  petActiveDays,
  type PetActivityRecords,
} from '@/features/pet/lib/activity'
import { petGiftSeed } from '@/features/pet/lib/gifts'
import {
  simulateLife,
  simulateLifeAhead,
  type PetLife,
  type PetLifeInput,
} from '@/features/pet/lib/life'

/**
 * What Home (`usePetLife`) and the widget (`petWidgetInput.ts`) both feed the
 * life replay, worked out once for both.
 */

let activeDaysMemo: { records: PetActivityRecords; days: Set<string> } | null =
  null

/**
 * `petActiveDays` of the ministry records, kept while every list is the same
 * object, so Home and the widget share one set (and `simulateLife` its cache).
 */
export function selectPetActiveDays(
  records: PetActivityRecords
): ReadonlySet<string> {
  const last = activeDaysMemo?.records
  if (
    last &&
    last.serviceReports === records.serviceReports &&
    last.visits === records.visits &&
    last.dayPlans === records.dayPlans &&
    last.recurringPlans === records.recurringPlans
  )
    return activeDaysMemo!.days
  const days = petActiveDays(records)
  activeDaysMemo = { records: { ...records }, days }
  return days
}

/** The replay's input for `pet` as of the day `today`. */
export const petLifeInput = (
  pet: PetRecord,
  activeDays: ReadonlySet<string>,
  today: string
): PetLifeInput => ({
  adoptedOn: pet.adoptedOn,
  activeDays,
  wakes: pet.wakes,
  today,
  giftSeed: petGiftSeed(pet),
})

/** The pet's hearts and moments on `today`. */
export const petLifeOn = (
  pet: PetRecord,
  activeDays: ReadonlySet<string>,
  today: string
): PetLife => simulateLife(petLifeInput(pet, activeDays, today))

/** The pet's life on `today` and each of the next `days` days. */
export const petLifeAhead = (
  pet: PetRecord,
  activeDays: ReadonlySet<string>,
  today: string,
  days: number
): PetLife[] => simulateLifeAhead(petLifeInput(pet, activeDays, today), days)
