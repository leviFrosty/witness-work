import type { Publisher } from '@/types/publisher'
import { getStreakKind } from '@/lib/publisherCapabilities'
import { roleForMonth, type RoleHistory } from '@/lib/roleHistory'
import type { PetRecord } from '@/types/pet'
import {
  petActiveDays,
  type PetActivityRecords,
} from '@/features/pet/lib/activity'
import { petGiftSeed } from '@/features/pet/lib/gifts'
import {
  simulateLife,
  simulateLifeAhead,
  type HeartsPace,
  type PetLife,
  type PetLifeInput,
} from '@/features/pet/lib/life'

let activeDaysMemo: { records: PetActivityRecords; days: Set<string> } | null =
  null

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

let paceMemo: {
  history: RoleHistory | null | undefined
  role: Publisher
  paceOf: (month: string) => HeartsPace
} | null = null

export function selectHeartsPace(
  history: RoleHistory | null | undefined,
  role: Publisher
): (month: string) => HeartsPace {
  if (paceMemo && paceMemo.history === history && paceMemo.role === role)
    return paceMemo.paceOf
  const paceOf = (month: string): HeartsPace => {
    const target = {
      year: Number(month.slice(0, 4)),
      month: Number(month.slice(5, 7)) - 1,
    }
    return getStreakKind(roleForMonth(history, role, target)) === 'months'
      ? 'monthly'
      : 'daily'
  }
  paceMemo = { history, role, paceOf }
  return paceOf
}

export const petLifeInput = (
  pet: PetRecord,
  activeDays: ReadonlySet<string>,
  today: string,
  paceOf?: (month: string) => HeartsPace
): PetLifeInput => ({
  adoptedOn: pet.adoptedOn,
  activeDays,
  wakes: pet.wakes,
  today,
  paceOf,
  giftSeed: petGiftSeed(pet),
})

export const petLifeOn = (
  pet: PetRecord,
  activeDays: ReadonlySet<string>,
  today: string,
  paceOf?: (month: string) => HeartsPace
): PetLife => simulateLife(petLifeInput(pet, activeDays, today, paceOf))

export const petLifeAhead = (
  pet: PetRecord,
  activeDays: ReadonlySet<string>,
  today: string,
  days: number,
  paceOf?: (month: string) => HeartsPace
): PetLife[] =>
  simulateLifeAhead(petLifeInput(pet, activeDays, today, paceOf), days)
