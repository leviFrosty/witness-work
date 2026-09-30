import { syncNow } from '@/lib/syncClock'
import type { Contact } from '@/types/contact'
import { stripContactForTombstone } from '@/lib/dataProtection'

export const DELETED_CONTACT_RETENTION_MS = 90 * 24 * 60 * 60_000

/** Expire recoverable details while retaining deletion evidence for old peers. */
export function expireDeletedContactDetails(
  contacts: Contact[],
  now = syncNow()
): Contact[] {
  return contacts.map((contact) => {
    const deletedAt = contact.updatedAt ?? 0
    if (contact.redacted) return contact
    if (deletedAt <= 1) {
      if (!contact.detailsRetainUntil)
        return {
          ...contact,
          detailsRetainUntil: now + DELETED_CONTACT_RETENTION_MS,
        }
      if (now < contact.detailsRetainUntil) return contact
    } else if (now - deletedAt < DELETED_CONTACT_RETENTION_MS) return contact
    return stripContactForTombstone(contact, deletedAt)
  })
}
