import { Alert } from 'react-native'

import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'

/**
 * Which occurrences of a recurring plan the user chose to remove.
 *
 * - `instance` — just the tapped date.
 * - `future` — the tapped date and everything after it.
 * - `all` — the whole recurring plan.
 */
export type RecurringDeleteScope = 'instance' | 'future' | 'all'

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
 * that offers the action (row menus, swipes, the edit screen's header) so the
 * copy and the recurring-scope choices never drift apart.
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
    {
      text: i18n.t('deleteThisPlan'),
      style: 'destructive',
      onPress: () => onDelete('instance'),
    },
    {
      text: i18n.t('deleteThisAndFollowingPlans'),
      style: 'destructive',
      onPress: () => onDelete('future'),
    },
    {
      text: i18n.t('deleteAllPlans'),
      style: 'destructive',
      onPress: () => onDelete('all'),
    },
  ])
}

export default confirmDeletePlan
