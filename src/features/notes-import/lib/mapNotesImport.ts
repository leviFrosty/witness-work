import type { Address, Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { TimeEntry } from '@/types/timeEntry'
import type { Category } from '@/types/category'
import type { MappedImport, MappedPublisher } from '@/lib/import/types'
import {
  LDC_BUILTIN_CATEGORY_ID,
  makeLdcBuiltinCategory,
} from '@/constants/categories'
import type {
  NotesImportResult,
  NotesImportSeverity,
  NotesImportWarningKind,
  NotesImportWarning,
  NotesImportDtoAddress,
} from '@/features/notes-import/lib/notesImportTypes'

/**
 * A warning resolved against the mapped records: `target.id` is the FINAL store
 * id of the record it concerns (or the sentinel `'publisher'`), so the preview
 * can join warnings to rows by `(kind, id)`. Targets the model couldn't resolve
 * become general (no target).
 */
export interface MappedWarning {
  id: string
  severity: NotesImportSeverity
  message: string
  target?: {
    kind: NotesImportWarningKind
    id: string
  }
}

/** The mapper output: a {@link MappedImport} plus the resolved warnings. */
export interface MappedNotesImport extends MappedImport {
  warnings: MappedWarning[]
}

export interface MapNotesImportOptions {
  /** Canonical content hash of the source notes — seeds every record id. */
  contentHash: string
  /** Deterministic clock for synthesized fallback dates. */
  importedAt: Date
}

// Hash-derived id helpers (decision 8): a single result's commit is idempotent
// and a cached-result replay is stable, because ids are a pure function of the
// content hash + the model's stable per-record handle.
const slug = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x'

const contactId = (hash: string, tempId: string) => `notes-${hash}-c-${tempId}`
const noteVisitId = (hash: string, tempId: string) =>
  `notes-${hash}-c-${tempId}-note`
const visitId = (hash: string, ref: string) => `notes-${hash}-v-${ref}`
const timeEntryId = (hash: string, ref: string) => `notes-${hash}-t-${ref}`
const categoryId = (hash: string, name: string) =>
  `notes-${hash}-cat-${slug(name)}`

const isLdcLike = (name: string): boolean => {
  const n = name.trim().toUpperCase()
  return n === 'LDC' || n === 'RBC'
}

const clean = (s: string | null | undefined): string | undefined => {
  const t = s?.trim()
  return t ? t : undefined
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses a model ISO string to a Date. A date-only value anchors to noon UTC on
 * that calendar day (so it buckets into the right month regardless of the
 * device timezone, matching the MyTime mapper); a full datetime is honored
 * as-is. An unparseable value falls back to `importedAt`.
 */
const parseDtoDate = (raw: string, importedAt: Date): Date => {
  if (DATE_ONLY.test(raw)) {
    const [y, m, d] = raw.split('-').map((n) => Number.parseInt(n, 10))
    return new Date(Date.UTC(y, m - 1, d, 12))
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? importedAt : parsed
}

const buildAddress = (
  dto: NotesImportDtoAddress | undefined
): Address | undefined => {
  if (!dto) return undefined
  const address: Address = {}
  const line1 = clean(dto.line1)
  if (line1) address.line1 = line1
  const line2 = clean(dto.line2)
  if (line2) address.line2 = line2
  const city = clean(dto.city)
  if (city) address.city = city
  const state = clean(dto.state)
  if (state) address.state = state
  const zip = clean(dto.zip)
  if (zip) address.zip = zip
  const country = clean(dto.country)
  if (country) address.country = country
  return Object.keys(address).length ? address : undefined
}

/**
 * Pure translation of the model's structured output into WitnessWork records
 * plus resolved warnings. No I/O, no store access, no clock — `importedAt` is
 * threaded in so synthesized fallback dates are deterministic. Mirrors
 * `mapMytimeData`'s shape so both feed `writeMappedDataToStores`.
 */
export const mapNotesImport = (
  result: NotesImportResult,
  { contentHash: hash, importedAt }: MapNotesImportOptions
): MappedNotesImport => {
  // --- Categories first (time entries + warnings reference them by name) ---
  const categories: Category[] = []
  const categoryIdByName = new Map<string, string>()
  const seenCategoryIds = new Set<string>()
  const importedAtMs = importedAt.getTime()

  const resolveNewCategory = (name: string, isCredit: boolean): string => {
    const existing = categoryIdByName.get(name)
    if (existing) return existing
    let id: string
    let category: Category
    if (isLdcLike(name)) {
      id = LDC_BUILTIN_CATEGORY_ID
      category = makeLdcBuiltinCategory(importedAtMs)
    } else {
      id = categoryId(hash, name)
      category = { id, name: name.trim(), isCredit, updatedAt: importedAtMs }
    }
    categoryIdByName.set(name, id)
    if (!seenCategoryIds.has(id)) {
      seenCategoryIds.add(id)
      categories.push(category)
    }
    return id
  }

  for (const c of result.categories) {
    const name = clean(c.name)
    if (!name) continue
    resolveNewCategory(name, c.isCredit)
  }

  // --- Contacts ---
  const contacts: Contact[] = []
  const contactIdByTempId = new Map<string, string>()
  for (const c of result.contacts) {
    const tempId = clean(c.tempId)
    const name = clean(c.name)
    if (!tempId || !name) continue
    const id = contactId(hash, tempId)
    contactIdByTempId.set(tempId, id)
    const contact: Contact = { id, name, createdAt: importedAt }
    const phone = clean(c.phone)
    if (phone) contact.phone = phone
    const email = clean(c.email)
    if (email) contact.email = email
    if (c.gender && c.gender !== 'unknown') contact.gender = c.gender
    const address = buildAddress(c.address)
    if (address) contact.address = address
    contacts.push(contact)
  }

  // --- Visits ---
  const visits: Visit[] = []
  const visitIdByRef = new Map<string, string>()
  const visitsByContactId = new Map<string, Visit[]>()

  result.visits.forEach((v, index) => {
    const resolvedContactId = v.contactTempId
      ? contactIdByTempId.get(v.contactTempId)
      : clean(v.contactId)
    // A visit must attach to a real contact; drop one that resolves to neither.
    if (!resolvedContactId) return

    const ref = clean(v.ref) ?? `i${index}`
    const id = visitId(hash, ref)
    visitIdByRef.set(ref, id)

    const visit: Visit = {
      id,
      contact: { id: resolvedContactId },
      date: parseDtoDate(v.date, importedAt),
      isBibleStudy: v.isBibleStudy === true,
    }
    const note = clean(v.note)
    if (note) visit.note = note
    if (v.notAtHome) visit.notAtHome = true
    if (v.followUp?.date) {
      visit.followUp = {
        date: parseDtoDate(v.followUp.date, importedAt),
        notifyMe: false,
      }
      const topic = clean(v.followUp.topic)
      if (topic) visit.followUp.topic = topic
    }
    visits.push(visit)
    const list = visitsByContactId.get(resolvedContactId)
    if (list) list.push(visit)
    else visitsByContactId.set(resolvedContactId, [visit])
  })

  // Seed contact-level notes onto the earliest visit, or a synthesized note
  // visit when the contact has none (mirrors the MyTime mapper's decision 3 —
  // Contact has no note field of its own).
  for (const c of result.contacts) {
    const tempId = clean(c.tempId)
    const note = clean(c.note)
    if (!tempId || !note) continue
    const id = contactIdByTempId.get(tempId)
    if (!id) continue
    const contactVisits = visitsByContactId.get(id)
    if (contactVisits && contactVisits.length) {
      const earliest = contactVisits.reduce((a, b) =>
        b.date.getTime() < a.date.getTime() ? b : a
      )
      earliest.note = earliest.note ? `${earliest.note}\n\n${note}` : note
    } else {
      visits.push({
        id: noteVisitId(hash, tempId),
        contact: { id },
        date: importedAt,
        isBibleStudy: false,
        note,
      })
    }
  }

  // --- Time entries ---
  const timeEntries: TimeEntry[] = []
  const timeEntryIdByRef = new Map<string, string>()

  result.timeEntries.forEach((t, index) => {
    const ref = clean(t.ref) ?? `i${index}`
    const id = timeEntryId(hash, ref)
    timeEntryIdByRef.set(ref, id)

    const entry: TimeEntry = {
      id,
      hours: Number.isFinite(t.hours) ? Math.max(0, Math.trunc(t.hours)) : 0,
      minutes: Number.isFinite(t.minutes)
        ? Math.min(59, Math.max(0, Math.trunc(t.minutes)))
        : 0,
      date: parseDtoDate(t.date, importedAt),
    }
    const note = clean(t.note)
    if (note) entry.note = note

    // Reuse an existing category id; otherwise resolve/seed a new one by name.
    let resolvedCategoryId: string | undefined
    let categoryIsCredit = false
    const existingCategoryId = clean(t.categoryId)
    const newCategoryName = clean(t.categoryName)
    if (existingCategoryId) {
      resolvedCategoryId = existingCategoryId
    } else if (newCategoryName) {
      const credit = t.credit === true || isLdcLike(newCategoryName)
      resolvedCategoryId = resolveNewCategory(newCategoryName, credit)
      categoryIsCredit = credit
    }
    if (resolvedCategoryId) entry.categoryId = resolvedCategoryId
    if (t.credit === true || categoryIsCredit) entry.credit = true
    timeEntries.push(entry)
  })

  // --- Publisher ---
  let publisher: MappedPublisher | null = null
  if (result.publisher?.role) {
    publisher = {
      role: result.publisher.role,
      tenureStartDate: result.publisher.tenureStartDate
        ? parseDtoDate(result.publisher.tenureStartDate, importedAt)
        : null,
    }
  }

  // --- Warnings: resolve each target ref to a final store id ---
  const warnings = result.warnings.map((w) =>
    resolveWarning(w, {
      contactIdByTempId,
      visitIdByRef,
      timeEntryIdByRef,
      categoryIdByName,
    })
  )

  return {
    contacts,
    visits,
    timeEntries,
    categories,
    customFieldDefs: [],
    publisher,
    warnings,
  }
}

const resolveWarning = (
  w: NotesImportWarning,
  maps: {
    contactIdByTempId: Map<string, string>
    visitIdByRef: Map<string, string>
    timeEntryIdByRef: Map<string, string>
    categoryIdByName: Map<string, string>
  }
): MappedWarning => {
  const base: MappedWarning = {
    id: w.id,
    severity: w.severity,
    message: w.message,
  }
  if (!w.target) return base
  const { kind, ref } = w.target
  let id: string | undefined
  switch (kind) {
    case 'contact':
      id = maps.contactIdByTempId.get(ref)
      break
    case 'visit':
      id = maps.visitIdByRef.get(ref)
      break
    case 'timeEntry':
      id = maps.timeEntryIdByRef.get(ref)
      break
    case 'category':
      id = maps.categoryIdByName.get(ref)
      break
    case 'publisher':
      id = 'publisher'
      break
  }
  // Unresolvable target → keep the warning, drop the (dangling) target.
  return id ? { ...base, target: { kind, id } } : base
}
