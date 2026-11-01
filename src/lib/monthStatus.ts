import i18n from '@/lib/locales'
import { publisherChoices } from '@/constants/publisher'
import type { Publisher } from '@/types/publisher'

export const AUXILIARY_REDUCED_GOAL_HOURS = 15

export type MonthStatus = Publisher | 'regularAuxiliaryReduced'

export const monthStatuses: readonly MonthStatus[] = publisherChoices.flatMap(
  (role): MonthStatus[] =>
    role === 'regularAuxiliary' ? [role, 'regularAuxiliaryReduced'] : [role]
)

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

export const monthStatusItems = (
  publisherHours: Record<Publisher, number>
): { label: string; value: MonthStatus }[] =>
  monthStatuses.map((status) => ({
    label: monthStatusLabel(status, publisherHours),
    value: status,
  }))

export const monthStatusShortLabel = (status: MonthStatus): string =>
  status === 'regularAuxiliary' || status === 'regularAuxiliaryReduced'
    ? i18n.t('monthStatus.auxiliaryShort')
    : i18n.t(status)
