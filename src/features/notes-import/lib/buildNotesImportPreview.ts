import type {
  MappedNotesImport,
  MappedWarning,
} from '@/features/notes-import/lib/mapNotesImport'
import type { MappedImport } from '@/lib/import/types'
import type { Contact } from '@/types/contact'
import type { NotesImportSeverity } from '@/features/notes-import/lib/notesImportTypes'

export type PreviewKind = 'contact' | 'visit' | 'timeEntry'

/** Imported contact fields, surfaced in the contact details modal. */
export interface PreviewContactInfo {
  phone?: string
  email?: string
  gender?: string
  /** A single human-readable address line, pre-joined for display. */
  addressLine?: string
}

export interface PreviewFollowUp {
  date: Date
  topic?: string
}

export interface PreviewRow {
  kind: PreviewKind
  id: string
  /** Primary display text (contact name / visit note / entry note). */
  title: string
  date?: Date
  /** Raw minutes for a time entry — the UI formats via the minutes helpers. */
  minutes?: number
  isBibleStudy?: boolean
  notAtHome?: boolean
  /** Follow-up attached to a visit, shown in full during import review. */
  followUp?: PreviewFollowUp
  /** Warnings whose target is this row. */
  warnings: MappedWarning[]
  /** Highest severity among this row's warnings, if any. */
  severity?: NotesImportSeverity
  /**
   * For visit rows: the final store id of the contact this visit belongs to.
   * Lets the preview nest visits under their contact instead of a flat list.
   */
  contactId?: string
  /** For contact rows: imported fields, for the details modal. */
  info?: PreviewContactInfo
}

export interface NotesImportPreview {
  contacts: PreviewRow[]
  visits: PreviewRow[]
  timeEntries: PreviewRow[]
  hasPublisher: boolean
  publisherRole?: string
  publisherWarnings: MappedWarning[]
  /** Warnings with no target (or an unresolved one) — whole-import notes. */
  generalWarnings: MappedWarning[]
  totalMinutes: number
  counts: { contacts: number; visits: number; timeEntries: number }
}

export interface PreviewSelection {
  /** Selected contact/visit/timeEntry row ids. */
  ids: Set<string>
  publisher: boolean
}

/** True when a parsed preview has nothing importable — no records, no publisher. */
export const isEmptyPreview = (preview: NotesImportPreview): boolean =>
  preview.counts.contacts === 0 &&
  preview.counts.visits === 0 &&
  preview.counts.timeEntries === 0 &&
  !preview.hasPublisher

/**
 * Pure transitions over {@link PreviewSelection}. Each returns a NEW selection
 * with a NEW `ids` Set — never mutating the input — so they're trivially
 * unit-testable and safe inside a React `setState` updater. The selection hook
 * (`useNotesImportSelection`) is a thin wrapper over these.
 */

/** Toggles a single row id; leaves the publisher flag untouched. */
export const toggleRowSelection = (
  selection: PreviewSelection,
  id: string
): PreviewSelection => {
  const ids = new Set(selection.ids)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return { ...selection, ids }
}

/** Flips only the publisher flag. */
export const togglePublisherSelection = (
  selection: PreviewSelection
): PreviewSelection => ({ ...selection, publisher: !selection.publisher })

/** Adds (`value` true) or removes (`value` false) a batch of row ids. */
export const setRowsSelection = (
  selection: PreviewSelection,
  ids: string[],
  value: boolean
): PreviewSelection => {
  const next = new Set(selection.ids)
  for (const id of ids) {
    if (value) next.add(id)
    else next.delete(id)
  }
  return { ...selection, ids: next }
}

/**
 * Adds or removes every row in `rows` (the already-resolved rows for a group —
 * the caller maps a {@link PreviewKind} to its rows and passes them in, keeping
 * this free of the preview shape).
 */
export const setGroupSelection = (
  selection: PreviewSelection,
  rows: { id: string }[],
  value: boolean
): PreviewSelection =>
  setRowsSelection(
    selection,
    rows.map((r) => r.id),
    value
  )

const SEVERITY_RANK: Record<NotesImportSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
}

export const highestSeverity = (
  warnings: MappedWarning[]
): NotesImportSeverity | undefined => {
  let top: NotesImportSeverity | undefined
  for (const w of warnings) {
    if (!top || SEVERITY_RANK[w.severity] > SEVERITY_RANK[top]) top = w.severity
  }
  return top
}

/** Picks the higher of two severities (used to roll visits up into a contact). */
export const maxSeverity = (
  a: NotesImportSeverity | undefined,
  b: NotesImportSeverity | undefined
): NotesImportSeverity | undefined => {
  if (a == null) return b
  if (b == null) return a
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b
}

/** Flattens a contact's imported fields into the display-only info object. */
const buildContactInfo = (c: Contact): PreviewContactInfo | undefined => {
  const addressLine = c.address
    ? [
        c.address.line1,
        c.address.line2,
        c.address.city,
        c.address.state,
        c.address.zip,
        c.address.country,
      ]
        .map((p) => p?.trim())
        .filter((p): p is string => !!p)
        .join(', ') || undefined
    : undefined
  const gender = c.gender && c.gender !== 'unknown' ? c.gender : undefined
  const info: PreviewContactInfo = {}
  if (c.phone) info.phone = c.phone
  if (c.email) info.email = c.email
  if (gender) info.gender = gender
  if (addressLine) info.addressLine = addressLine
  return Object.keys(info).length ? info : undefined
}

/**
 * Turns a mapped Notes Import into the preview view-model + the initial
 * selection. Warnings are attached to the rows they target; rows that carry an
 * error-severity warning start DESELECTED (decision 12) — unsafe-to-commit data
 * is opt-in, everything else opt-out.
 */
export const buildNotesImportPreview = (
  mapped: MappedNotesImport
): { preview: NotesImportPreview; selection: PreviewSelection } => {
  const byTarget = new Map<string, MappedWarning[]>()
  const general: MappedWarning[] = []
  for (const w of mapped.warnings) {
    if (!w.target) {
      general.push(w)
      continue
    }
    const list = byTarget.get(w.target.id)
    if (list) list.push(w)
    else byTarget.set(w.target.id, [w])
  }

  const warningsFor = (id: string) => byTarget.get(id) ?? []

  const contacts: PreviewRow[] = mapped.contacts.map((c) => {
    const warnings = warningsFor(c.id)
    return {
      kind: 'contact',
      id: c.id,
      title: c.name,
      warnings,
      severity: highestSeverity(warnings),
      info: buildContactInfo(c),
    }
  })

  const visits: PreviewRow[] = mapped.visits.map((v) => {
    const warnings = warningsFor(v.id)
    return {
      kind: 'visit',
      id: v.id,
      title: v.note ?? '',
      date: v.date,
      isBibleStudy: v.isBibleStudy,
      notAtHome: v.notAtHome,
      followUp: v.followUp
        ? { date: v.followUp.date, topic: v.followUp.topic }
        : undefined,
      warnings,
      severity: highestSeverity(warnings),
      contactId: v.contact.id,
    }
  })

  const timeEntries: PreviewRow[] = mapped.timeEntries.map((t) => {
    const warnings = warningsFor(t.id)
    return {
      kind: 'timeEntry',
      id: t.id,
      title: t.note ?? '',
      date: t.date,
      minutes: t.hours * 60 + t.minutes,
      warnings,
      severity: highestSeverity(warnings),
    }
  })

  const publisherWarnings = warningsFor('publisher')

  const preview: NotesImportPreview = {
    contacts,
    visits,
    timeEntries,
    hasPublisher: mapped.publisher != null,
    publisherRole: mapped.publisher?.role,
    publisherWarnings,
    generalWarnings: general,
    totalMinutes: timeEntries.reduce((sum, r) => sum + (r.minutes ?? 0), 0),
    counts: {
      contacts: contacts.length,
      visits: visits.length,
      timeEntries: timeEntries.length,
    },
  }

  const ids = new Set<string>()
  for (const row of [...contacts, ...visits, ...timeEntries]) {
    if (row.severity !== 'error') ids.add(row.id)
  }
  const selection: PreviewSelection = {
    ids,
    publisher:
      preview.hasPublisher && highestSeverity(publisherWarnings) !== 'error',
  }

  return { preview, selection }
}

/**
 * Projects a mapped Notes Import down to only the selected records, ready to
 * commit. Enforces referential integrity: a visit is dropped when its NEW
 * contact is deselected, and only categories referenced by an included time
 * entry ride along (categories aren't independently toggleable — they follow
 * their time, mirroring MyTime).
 */
export const selectMappedImport = (
  mapped: MappedNotesImport,
  selection: PreviewSelection
): MappedImport => {
  const mappedContactIds = new Set(mapped.contacts.map((c) => c.id))
  const contacts = mapped.contacts.filter((c) => selection.ids.has(c.id))
  const includedContactIds = new Set(contacts.map((c) => c.id))

  const visits = mapped.visits.filter((v) => {
    if (!selection.ids.has(v.id)) return false
    // Drop a visit whose NEW contact was deselected (would dangle).
    if (mappedContactIds.has(v.contact.id)) {
      return includedContactIds.has(v.contact.id)
    }
    return true
  })

  const timeEntries = mapped.timeEntries.filter((t) => selection.ids.has(t.id))
  const referencedCategoryIds = new Set(
    timeEntries.map((t) => t.categoryId).filter((id): id is string => !!id)
  )
  const categories = mapped.categories.filter((c) =>
    referencedCategoryIds.has(c.id)
  )

  return {
    contacts,
    visits,
    timeEntries,
    categories,
    customFieldDefs: [],
    publisher: selection.publisher ? mapped.publisher : null,
  }
}
