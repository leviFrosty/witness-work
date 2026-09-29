import { Alert } from 'react-native'

import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'

/**
 * Which occurrences of a recurring plan the user chose to remove.
 *
 * - `instance` — just the tapped date.
 * - `future` — the tapped date and everything after it.
 * - `all` — the whole recurring plan.
 */
export type RecurringDeleteScope = 'instance' | 'future' | 'all'

/** Every recurring scope, in the order menus and alerts list them. */
export const RECURRING_DELETE_SCOPES: RecurringDeleteScope[] = [
  'instance',
  'future',
  'all',
]

/** The shared label for a recurring scope, in alerts and menus alike. */
export const recurringDeleteScopeLabel = (scope: RecurringDeleteScope) =>
  i18n.t(
    scope === 'instance'
      ? 'deleteThisPlan'
      : scope === 'future'
        ? 'deleteThisAndFollowingPlans'
        : 'deleteAllPlans'
  )

/** The plan a delete applies to: a Day Plan, or one recurring occurrence. */
export type PlanDeleteTarget =
  | { kind: 'day'; planId: string }
  | {
      kind: 'recurring'
      planId: string
      /** The occurrence the user acted on (local day). */
      date: Date
    }

/**
 * Removes a plan — or, for a recurring plan, the chosen occurrences. Doesn't
 * confirm; pair it with `confirmDeletePlan` / `confirmDeletePlanScope`.
 */
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
  /**
   * A recurring plan instance asks which occurrences to remove; a day plan
   * doesn't.
   */
  recurring: boolean
  /** Runs only on confirm. `scope` is undefined for one-off day plans. */
  onDelete: (scope?: RecurringDeleteScope) => void
}

/**
 * The single confirmation flow for deleting a plan, shared by every surface
 * that offers the action (row menus, swipes, the edit screen) so the copy and
 * the recurring-scope choices never drift apart.
 */
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

/**
 * Confirms a recurring scope the user already picked (e.g. from a context
 * menu's Delete submenu): same copy as `confirmDeletePlan`, one destructive
 * button naming the scope.
 */
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
