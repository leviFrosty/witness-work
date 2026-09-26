import i18n from '@/lib/locales'
import type { Publisher } from '@/types/publisher'

/**
 * The reduced Monthly Goal an auxiliary pioneer may choose in some months (e.g.
 * March, April, or the month of the circuit overseer's visit).
 */
export const AUXILIARY_REDUCED_GOAL_HOURS = 15

/**
 * What the User picks for one month on the month status sheet and the Service
 * History editor: a Publisher role, plus the reduced-goal auxiliary variant
 * (stored as `regularAuxiliary` with a 15h Monthly Goal override).
 */
export const monthStatuses = [
  'publisher',
  'regularAuxiliary',
  'regularAuxiliaryReduced',
  'regularPioneer',
  'specialPioneer',
  'circuitOverseer',
  'custom',
] as const
export type MonthStatus = (typeof monthStatuses)[number]

export const roleOfMonthStatus = (status: MonthStatus): Publisher =>
  status === 'regularAuxiliaryReduced' ? 'regularAuxiliary' : status

export const monthStatusOf = (
  role: Publisher,
  goalOverrideHours: number | undefined
): MonthStatus =>
  role === 'regularAuxiliary' &&
  goalOverrideHours === AUXILIARY_REDUCED_GOAL_HOURS
    ? 'regularAuxiliaryReduced'
    : role

export const monthStatusLabel = (
  status: MonthStatus,
  publisherHours: Record<Publisher, number>
): string => {
  switch (status) {
    case 'regularAuxiliary':
      return i18n.t('monthStatus.auxiliary', {
        count: publisherHours.regularAuxiliary,
      })
    case 'regularAuxiliaryReduced':
      return i18n.t('monthStatus.auxiliary', {
        count: AUXILIARY_REDUCED_GOAL_HOURS,
      })
    default:
      return i18n.t(status)
  }
}

/**
 * The status name alone, for places that show the goal beside it (the month
 * card's status line) — so "(30 hours)" isn't repeated.
 */
export const monthStatusShortLabel = (status: MonthStatus): string =>
  status === 'regularAuxiliary' || status === 'regularAuxiliaryReduced'
    ? i18n.t('monthStatus.auxiliaryShort')
    : i18n.t(status)
