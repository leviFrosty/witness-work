import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

/**
 * Data protection mode (GDPR / UK GDPR / Swiss FADP).
 *
 * Regions where the app defaults data protection mode on. EU/EEA member states
 * plus the UK and Switzerland, whose laws mirror GDPR for householder records.
 * See `docs/gdpr-mode-research.md`.
 */
export const DATA_PROTECTION_REGIONS: ReadonlySet<string> = new Set([
  // EU
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  // EEA (non-EU)
  'IS',
  'LI',
  'NO',
  // GDPR-equivalent regimes
  'GB',
  'CH',
])

/** Days without a logged visit after which a contact is offered for deletion. */
export const DATA_PROTECTION_RETENTION_DAYS = 90

export const isDataProtectionRegion = (
  regionCode: string | null | undefined
): boolean =>
  !!regionCode && DATA_PROTECTION_REGIONS.has(regionCode.toUpperCase())

/**
 * Minimum interval between retention prompts, so the reminder can never turn
 * into a nag. Measured from `preferences.dataProtectionRetentionPromptedAt`.
 */
export const DATA_PROTECTION_RETENTION_PROMPT_INTERVAL_DAYS = 30

/**
 * Builds the only tombstone a hard-deleted Contact is allowed to leave behind.
 *
 * ICloud sync resolves deletions with last-writer-wins on `updatedAt` (see
 * `mergeById` / `reconcileActiveAndDeletedContacts` in `app/sync/merge.ts`), so
 * the tombstone needs an `id` and an `updatedAt` newer than any surviving copy
 * of the record — and nothing else. Every householder field (name, address,
 * coordinate, phone, email, custom fields, avatar, consent) is dropped here
 * rather than retained for the Recover Contacts screen, because a tombstone
 * that still names the person is exactly the indefinitely-retained record data
 * protection mode exists to prevent (`docs/gdpr-mode-research.md` §9.4).
 *
 * `name` and `createdAt` are structurally required by {@link Contact}; `name`
 * becomes empty and `createdAt` is re-stamped to the deletion moment so it
 * cannot leak when the publisher first met this householder.
 */
export const stripContactForTombstone = (
  contact: Contact,
  deletedAt: number = Date.now()
): Contact => ({
  id: contact.id,
  name: '',
  createdAt: new Date(deletedAt),
  updatedAt: deletedAt,
  redacted: true,
})

/**
 * True for a tombstone produced by {@link stripContactForTombstone}. Such a
 * record carries no recoverable content, so surfaces like Recover Contacts must
 * not offer it for restore.
 */
export const isRedactedContactTombstone = (contact: Contact): boolean =>
  contact.redacted === true

/**
 * Contacts the retention prompt should offer to delete: nothing logged against
 * them, and no edit to the record itself, within `retentionDays`.
 *
 * Both halves matter. "No visit" alone would sweep up a contact the publisher
 * just created but hasn't visited yet; "no update" alone would keep a contact
 * alive forever because an unrelated field was touched. A contact with no
 * visits at all is judged purely on its own `updatedAt` (falling back to
 * `createdAt` for records predating sync timestamps).
 *
 * Pure — the caller supplies the clock so this is trivially testable.
 */
export const retentionCandidates = (args: {
  contacts: Contact[]
  visits: Pick<Visit, 'date' | 'contact'>[]
  now?: number
  retentionDays?: number
}): Contact[] => {
  const {
    contacts,
    visits,
    now = Date.now(),
    retentionDays = DATA_PROTECTION_RETENTION_DAYS,
  } = args
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000

  const lastVisitAt = new Map<string, number>()
  for (const visit of visits) {
    const at = new Date(visit.date).getTime()
    if (Number.isNaN(at)) continue
    const current = lastVisitAt.get(visit.contact.id)
    if (current === undefined || at > current) {
      lastVisitAt.set(visit.contact.id, at)
    }
  }

  return contacts.filter((contact) => {
    const visitedAt = lastVisitAt.get(contact.id)
    if (visitedAt !== undefined && visitedAt >= cutoff) return false
    const touchedAt =
      contact.updatedAt ?? new Date(contact.createdAt).getTime() ?? 0
    if (Number.isNaN(touchedAt)) return true
    return touchedAt < cutoff
  })
}

/**
 * Whether enough time has passed since the last retention prompt. A missing
 * timestamp means the user has never been asked.
 */
export const shouldPromptForRetention = (
  lastPromptedAt: string | undefined,
  now: number = Date.now()
): boolean => {
  if (!lastPromptedAt) return true
  const at = new Date(lastPromptedAt).getTime()
  if (Number.isNaN(at)) return true
  return (
    now - at >=
    DATA_PROTECTION_RETENTION_PROMPT_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  )
}
