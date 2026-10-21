import { Platform } from 'react-native'
import upperFirst from 'lodash/upperFirst'
import i18n, { type TranslationKey } from '@/lib/locales'
import { ltrIsolate } from '@/lib/direction'
import type { ImportCommitResult } from '@/lib/import/writeMappedData'
import type { NotesImportErrorCode } from '@/features/notes-import/lib/notesImportClient'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'
import type { PreviewContactInfo } from '@/features/notes-import/lib/buildNotesImportPreview'

/**
 * What Notes Import needs on a device that can't be verified: the account's own
 * words (ADR 0027), which name Notes Import already.
 */
export const unverifiedDeviceKey = (): TranslationKey =>
  Platform.OS === 'android'
    ? 'account_unverifiedBodyAndroid'
    : 'account_unverifiedBody'

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
      return 'notesImport_attestationError'
    case 'attestation_unavailable':
      return 'notesImport_attestationUnavailable'
    case 'active_cap':
      return 'notesImport_activeCapError'
    case 'transcribe_limit':
      return 'notesImport_paperLimit'
    case 'device_ineligible':
      return unverifiedDeviceKey()
    case 'suspended':
      return 'notesImport_suspended'
    case 'upgrade_required':
      return 'notesImport_updateRequired'
    case 'refinement_limit':
      return 'notesImport_refinementLimit'
    case 'unavailable':
      return 'notesImport_unavailable'
    default:
      return 'notesImport_error'
  }
}

/**
 * Machine reason codes the proxy emits, or the app sets (`device_unverified`);
 * everything else is operator free text.
 */
const MACHINE_UNAVAILABLE_REASONS = new Set([
  'disabled',
  'no_provider',
  'version_below_min',
  'android_unavailable',
  'device_unverified',
  'suspended',
])

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

const COUNT_KEYS: Record<CountKind, string> = {
  contact: 'notesImport_contactCount',
  visit: 'notesImport_visitCount',
  timeEntry: 'notesImport_timeEntryCount',
}

/** "N contacts/visits/time entries", in the Language's plural form for N. */
const countLabel = (kind: CountKind, count: number): string => {
  return i18n.t(COUNT_KEYS[kind] as TranslationKey, {
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

/**
 * The imported contact's fields as the details sheet lists them. Phone and
 * email stay left to right in a right-to-left Language ("+1 415 555 0134",
 * never "0134 555 415 1+").
 */
export const contactDetailLines = (
  info: PreviewContactInfo | undefined
): { label: string; value: string }[] => {
  if (!info) return []
  const lines = [
    info.phone && {
      label: i18n.t('notesImport_detailPhone'),
      value: ltrIsolate(info.phone),
    },
    info.email && {
      label: i18n.t('notesImport_detailEmail'),
      value: ltrIsolate(info.email),
    },
    info.addressLine && {
      label: i18n.t('notesImport_detailAddress'),
      value: info.addressLine,
    },
    info.gender && {
      label: i18n.t('notesImport_detailGender'),
      value: upperFirst(info.gender),
    },
  ]
  return lines.filter(
    (line): line is { label: string; value: string } => !!line
  )
}
