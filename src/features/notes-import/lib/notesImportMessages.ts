import i18n from '@/lib/locales'
import type { ImportCommitResult } from '@/lib/import/writeMappedData'
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
    case 'unavailable':
      return 'notesImport_unavailable'
    default:
      return 'notesImport_error'
  }
}

/** Machine reason codes the proxy emits; everything else is operator free text. */
const MACHINE_UNAVAILABLE_REASONS = new Set(['disabled', 'no_provider'])

/**
 * The operator-supplied detail to show beneath the generic "unavailable"
 * message (e.g. "Down for maintenance until 5pm"), or undefined when the reason
 * is just a machine code — those have no extra info worth surfacing to a user.
 */
export const unavailableDetail = (
  reason?: string | null
): string | undefined => {
  const trimmed = reason?.trim()
  return trimmed && !MACHINE_UNAVAILABLE_REASONS.has(trimmed)
    ? trimmed
    : undefined
}

type CountKind = 'contact' | 'visit' | 'timeEntry'

const COUNT_KEYS: Record<CountKind, readonly [string, string]> = {
  contact: ['notesImport_contactCount', 'notesImport_contactCount_plural'],
  visit: ['notesImport_visitCount', 'notesImport_visitCount_plural'],
  timeEntry: [
    'notesImport_timeEntryCount',
    'notesImport_timeEntryCount_plural',
  ],
}

/**
 * "N contact(s)/visit(s)/time entr(y/ies)" via the locale's singular OR plural
 * key.
 */
const countLabel = (kind: CountKind, count: number): string => {
  const [singular, plural] = COUNT_KEYS[kind]
  return i18n.t((count === 1 ? singular : plural) as 'notesImport_visitCount', {
    count,
  })
}

/** Joins present groups with ' · ', omitting any zero-count group. */
const joinCounts = (parts: [CountKind, number][]): string =>
  parts
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => countLabel(kind, n))
    .join(' · ')

/**
 * Deterministic "3 contacts · 5 visits · 2 time entries" summary from a result.
 * Omits any zero-count group; returns '' when nothing was imported.
 */
export const notesImportCountsLine = (result: NotesImportResult): string =>
  joinCounts([
    ['contact', result.contacts.length],
    ['visit', result.visits.length],
    ['timeEntry', result.timeEntries.length],
  ])

/**
 * Like {@link notesImportCountsLine} but counts what a commit ACTUALLY inserted
 * (after deselection + reconcile drops), so a success card never overstates a
 * partial import.
 */
export const notesImportCommitCountsLine = (
  commit: ImportCommitResult
): string =>
  joinCounts([
    ['contact', commit.insertedContactIds.length],
    ['visit', commit.insertedVisitIds.length],
    ['timeEntry', commit.insertedTimeEntries.length],
  ])

/** Pluralized "N visit(s)" label. */
export const visitCountLabel = (count: number): string =>
  countLabel('visit', count)
