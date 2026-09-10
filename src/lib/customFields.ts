import { Contact } from '@/types/contact'
import { CustomFieldTombstone } from '@/types/customField'

/**
 * Removes values for permanently deleted custom fields from a contact. A
 * contact without a matching value is returned by identity so unrelated records
 * keep their existing timestamps and object shape.
 */
export function stripTombstonedCustomFields(
  contact: Contact,
  tombstones: readonly CustomFieldTombstone[],
  updatedAt?: number
): Contact {
  const customFields = stripTombstonedCustomFieldValues(
    contact.customFields,
    tombstones
  )
  if (customFields === contact.customFields) return contact
  return updatedAt === undefined
    ? { ...contact, customFields }
    : { ...contact, customFields, updatedAt }
}

/** Returns the same map when no tombstoned value is present. */
export function stripTombstonedCustomFieldValues(
  customFields: Record<string, string> | undefined,
  tombstones: readonly CustomFieldTombstone[]
): Record<string, string> | undefined {
  if (!customFields || tombstones.length === 0) return customFields

  const deletedIds = new Set(tombstones.map((tombstone) => tombstone.id))
  const next = { ...customFields }
  let changed = false

  for (const id of deletedIds) {
    if (next[id] === undefined) continue
    delete next[id]
    changed = true
  }

  return changed ? next : customFields
}
