import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

export const DATA_PROTECTION_REGIONS: ReadonlySet<string> = new Set([
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

  'IS',
  'LI',
  'NO',

  'GB',
  'CH',
])

export const DATA_PROTECTION_RETENTION_DAYS = 90

export const isDataProtectionRegion = (
  regionCode: string | null | undefined
): boolean =>
  !!regionCode && DATA_PROTECTION_REGIONS.has(regionCode.toUpperCase())

export const DATA_PROTECTION_RETENTION_PROMPT_INTERVAL_DAYS = 30

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

export const isRedactedContactTombstone = (contact: Contact): boolean =>
  contact.redacted === true

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
