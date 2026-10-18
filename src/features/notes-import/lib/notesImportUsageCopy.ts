import i18n from '@/lib/locales'
import {
  isUnlimitedUsage,
  type NotesImportUsageView,
} from '@/features/notes-import/lib/notesImportUsage'

/** The words for the composer's Import Credits control. */

/** The balance beside the title, and the trigger's short form. */
export const notesImportUsageLabels = (
  view: NotesImportUsageView
): { balance: string; trigger: string } => {
  if (isUnlimitedUsage(view))
    return {
      balance: i18n.t('notesImport_usageUnlimitedImports'),
      trigger: i18n.t('notesImport_usageUnlimitedShort'),
    }
  switch (view.kind) {
    case 'balance':
      return {
        balance: i18n.t('notesImport_usageImportsLeft', {
          remaining: view.credits.remaining ?? 0,
          limit: view.credits.limit ?? 0,
        }),
        trigger: i18n.t('notesImport_usageRemainingShort', {
          remaining: view.credits.remaining ?? 0,
        }),
      }
    case 'allowance':
      return view.limit === 0
        ? {
            balance: i18n.t('notesImport_usageNoImports'),
            trigger: i18n.t('notesImport_usageRemainingShort', {
              remaining: 0,
            }),
          }
        : {
            // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
            balance: i18n.t('notesImport_scheduleImportsFinite', {
              count: view.limit ?? 0,
              days: view.windowDays,
            }),
            trigger: i18n.t('notesImport_usageAllowanceShort', {
              limit: view.limit ?? 0,
            }),
          }
    case 'unavailable':
      return {
        balance: i18n.t('notesImport_usageUnavailable'),
        trigger: i18n.t('notesImport_usageUnavailableShort'),
      }
  }
}

/** The line under the balance: what credits are, and Supporter's part. */
export const notesImportUsageBody = (
  view: NotesImportUsageView,
  isSupporter: boolean
): string =>
  !isSupporter
    ? i18n.t('notesImport_usageImportsBody')
    : isUnlimitedUsage(view)
      ? i18n.t('notesImport_usageSupporterUnlimitedBody')
      : i18n.t('notesImport_usageCreditsBody')
