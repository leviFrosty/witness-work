import { Alert } from 'react-native'

import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'

export type RecurringDeleteScope = 'instance' | 'future' | 'all'

export const RECURRING_DELETE_SCOPES: RecurringDeleteScope[] = [
  'instance',
  'future',
  'all',
]

export const recurringDeleteScopeLabel = (scope: RecurringDeleteScope) =>
  i18n.t(
    scope === 'instance'
      ? 'deleteThisPlan'
      : scope === 'future'
        ? 'deleteThisAndFollowingPlans'
        : 'deleteAllPlans'
  )

export type PlanDeleteTarget =
  | { kind: 'day'; planId: string }
  | {
      kind: 'recurring'
      planId: string

      date: Date
    }

export const deletePlan = (
  target: PlanDeleteTarget,
  scope: RecurringDeleteScope = 'all'
) => {
  const store = useServiceReport.getState()
  if (target.kind === 'day') {
    store.deleteDayPlan(target.planId)
  } else if (scope === 'instance') {
    store.deleteSingleEventFromRecurringPlan(target.planId, target.date)
  } else if (scope === 'future') {
    store.deleteEventAndFutureEvents(target.planId, target.date)
  } else {
    store.deleteRecurringPlan(target.planId)
  }
}

interface ConfirmDeletePlanOptions {
  recurring: boolean

  onDelete: (scope?: RecurringDeleteScope) => void
}

const confirmDeletePlan = ({
  recurring,
  onDelete,
}: ConfirmDeletePlanOptions) => {
  if (!recurring) {
    confirmDestructive({
      title: i18n.t('deletePlan_title'),
      description: i18n.t('deletePlan_description'),
      onConfirm: () => onDelete(),
    })
    return
  }

  Alert.alert(i18n.t('deletePlan_title'), i18n.t('deletePlan_description'), [
    { text: i18n.t('cancel'), style: 'cancel' },
    ...RECURRING_DELETE_SCOPES.map((scope) => ({
      text: recurringDeleteScopeLabel(scope),
      style: 'destructive' as const,
      onPress: () => onDelete(scope),
    })),
  ])
}

export const confirmDeletePlanScope = ({
  scope,
  onDelete,
}: {
  scope: RecurringDeleteScope
  onDelete: (scope: RecurringDeleteScope) => void
}) => {
  confirmDestructive({
    title: i18n.t('deletePlan_title'),
    description: i18n.t('deletePlan_description'),
    confirmLabel: recurringDeleteScopeLabel(scope),
    onConfirm: () => onDelete(scope),
  })
}

export default confirmDeletePlan
