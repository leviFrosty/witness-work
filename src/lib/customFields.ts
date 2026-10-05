import {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'

/**
 * Removes values for permanently deleted custom fields from a record (a contact
 * or a visit). A record without a matching value is returned by identity so
 * unrelated records keep their existing timestamps and object shape.
 */
export function stripTombstonedCustomFields<
  T extends { customFields?: Record<string, string> },
>(
  record: T,
  tombstones: readonly CustomFieldTombstone[],
  updatedAt?: number
): T {
  const customFields = stripTombstonedCustomFieldValues(
    record.customFields,
    tombstones
  )
  if (customFields === record.customFields) return record
  return updatedAt === undefined
    ? { ...record, customFields }
    : { ...record, customFields, updatedAt }
}

/** Returns the same map when no tombstoned value is present. */
export function stripTombstonedCustomFieldValues(
  customFields: Record<string, string> | undefined,
  tombstones: readonly CustomFieldTombstone[]
): Record<string, string> | undefined {
  if (!customFields || tombstones.length === 0) return customFields

  const deletedIds = new Set(
    tombstones.flatMap((tombstone) => [
      tombstone.id,
      ...(tombstone.legacyIds ?? []),
    ])
  )
  const next = { ...customFields }
  let changed = false

  for (const id of deletedIds) {
    if (next[id] === undefined) continue
    delete next[id]
    changed = true
  }

  return changed ? next : customFields
}

/** Non-archived definitions in their display order. */
export function activeCustomFieldDefs(
  defs: readonly CustomFieldDefinition[]
): CustomFieldDefinition[] {
  return defs.filter((d) => !d.archived).sort((a, b) => a.order - b.order)
}
