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

const refinementAllowance = (value: number | null): string => {
  if (value === null) {
    return i18n.t('notesImport_scheduleRefinementsUnlimited')
  }
  if (value === 0) return i18n.t('notesImport_scheduleRefinementsNone')
  return i18n.t(
    value === 1
      ? 'notesImport_scheduleRefinementsFinite'
      : 'notesImport_scheduleRefinementsFinite_plural',
    { count: value }
  )
}

export interface NotesImportScheduleCopy {
  freeImports: string
  supporterImports: string
  freeRefinements: string
  supporterRefinements: string
}

/** Turns a fresh session schedule into explicit zero/finite/unlimited copy. */
export const notesImportScheduleCopy = (
  schedule: NotesImportPublicSchedule
): NotesImportScheduleCopy => ({
  freeImports: importAllowance(schedule.imports.free, schedule.windowDays),
  supporterImports: importAllowance(
    schedule.imports.supporter,
    schedule.windowDays
  ),
  freeRefinements: refinementAllowance(schedule.refinements.free),
  supporterRefinements: refinementAllowance(schedule.refinements.supporter),
})
