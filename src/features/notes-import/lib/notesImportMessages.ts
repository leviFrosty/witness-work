import i18n from '@/lib/locales'
import type { NotesImportErrorCode } from '@/features/notes-import/lib/notesImportClient'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'

/**
 * Maps a run's error code to its user-facing i18n key. Callers cast the result
 * to a concrete TranslationKey (`as 'notesImport_error'`) at the `i18n.t`
 * site.
 */
export const errorMessageKey = (code: NotesImportErrorCode): string => {
  switch (code) {
    case 'too_large':
      return 'notesImport_tooLarge'
    case 'model_error':
      return 'notesImport_modelError'
    case 'network':
      return 'notesImport_networkError'
    case 'attestation_failed':
    case 'attestation_required':
      return 'notesImport_attestationError'
    case 'refinement_limit':
      return 'notesImport_refinementLimit'
    default:
      return 'notesImport_error'
  }
}

/**
 * Deterministic "3 contacts · 5 visits · 2 time entries" summary from a result.
 * Omits any zero-count group; returns '' when nothing was imported.
 */
export const notesImportCountsLine = (result: NotesImportResult): string =>
  [
    result.contacts.length
      ? i18n.t('notesImport_contactCount', { count: result.contacts.length })
      : null,
    result.visits.length
      ? i18n.t('notesImport_visitCount', { count: result.visits.length })
      : null,
    result.timeEntries.length
      ? i18n.t('notesImport_timeEntryCount', {
          count: result.timeEntries.length,
        })
      : null,
  ]
    .filter((s): s is string => !!s)
    .join(' · ')

/** Pluralized "N visit(s)" label. */
export const visitCountLabel = (count: number): string =>
  i18n.t(
    count === 1 ? 'notesImport_visitCount' : 'notesImport_visitCount_plural',
    { count }
  )
