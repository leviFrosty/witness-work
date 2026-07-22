import i18n from '@/lib/locales'
import type { NotesImportPublicSchedule } from '@/features/notes-import/lib/notesImportUsage'

const importAllowance = (value: number | null, windowDays: number): string => {
  if (value === null) return i18n.t('notesImport_scheduleImportsUnlimited')
  if (value === 0) return i18n.t('notesImport_scheduleImportsNone')
  return i18n.t(
    value === 1
      ? 'notesImport_scheduleImportsFinite'
      : 'notesImport_scheduleImportsFinite_plural',
    { count: value, days: windowDays }
  )
}

export interface NotesImportScheduleCopy {
  freeImports: string
  supporterImports: string
}

/** Turns a fresh session schedule into explicit import-allowance copy. */
export const notesImportScheduleCopy = (
  schedule: NotesImportPublicSchedule
): NotesImportScheduleCopy => ({
  freeImports: importAllowance(schedule.imports.free, schedule.windowDays),
  supporterImports: importAllowance(
    schedule.imports.supporter,
    schedule.windowDays
  ),
})
