import {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'

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

export function activeCustomFieldDefs(
  defs: readonly CustomFieldDefinition[]
): CustomFieldDefinition[] {
  return defs.filter((d) => !d.archived).sort((a, b) => a.order - b.order)
}
