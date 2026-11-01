import * as Crypto from 'expo-crypto'
import { syncTimestamp } from '@/lib/syncClock'
import {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'

export function addCustomFieldDefinition(
  defs: CustomFieldDefinition[],
  label: string
): { defs: CustomFieldDefinition[]; def: CustomFieldDefinition | null } {
  const trimmed = label.trim()
  if (!trimmed) return { defs, def: null }
  const existing = defs.find((d) => !d.archived && d.label === trimmed)
  if (existing) return { defs, def: existing }
  const now = syncTimestamp()
  const def: CustomFieldDefinition = {
    id: Crypto.randomUUID(),
    label: trimmed,
    order: nextCustomFieldOrder(defs),
    createdAt: now,
    updatedAt: now,
  }
  return { defs: [...defs, def], def }
}

export function renameCustomFieldDefinition(
  defs: CustomFieldDefinition[],
  id: string,
  label: string
): CustomFieldDefinition[] {
  const trimmed = label.trim()
  if (!trimmed) return defs
  return defs.map((d) =>
    d.id === id
      ? { ...d, label: trimmed, updatedAt: syncTimestamp(d.updatedAt) }
      : d
  )
}

export function reorderCustomFieldDefinitions(
  defs: CustomFieldDefinition[],
  orderedIds: string[]
): CustomFieldDefinition[] {
  const now = syncTimestamp(
    defs.reduce((stamp, def) => Math.max(stamp, def.updatedAt), 0)
  )
  const byId = new Map(defs.map((d) => [d.id, d]))
  const reorderedActive: CustomFieldDefinition[] = []
  orderedIds.forEach((id, idx) => {
    const def = byId.get(id)
    if (!def || def.archived) return
    reorderedActive.push({
      ...def,
      order: idx,
      updatedAt: def.order === idx ? def.updatedAt : now,
    })
  })

  const archived = defs
    .filter((d) => d.archived)
    .map((d, i) => ({
      ...d,
      order: orderedIds.length + i,
      updatedAt: d.order === orderedIds.length + i ? d.updatedAt : now,
    }))
  return [...reorderedActive, ...archived]
}

export function archiveCustomFieldDefinition(
  defs: CustomFieldDefinition[],
  id: string
): CustomFieldDefinition[] {
  return defs.map((d) =>
    d.id === id
      ? { ...d, archived: true, updatedAt: syncTimestamp(d.updatedAt) }
      : d
  )
}

export function restoreCustomFieldDefinition(
  defs: CustomFieldDefinition[],
  id: string
): CustomFieldDefinition[] {
  const target = defs.find((d) => d.id === id)
  if (!target || !target.archived) return defs
  const activeCount = defs.filter((d) => !d.archived).length
  const now = syncTimestamp(target.updatedAt)
  return defs.map((d) =>
    d.id === id
      ? { ...d, archived: false, order: activeCount, updatedAt: now }
      : d
  )
}

export function purgeCustomFieldDefinition(
  defs: CustomFieldDefinition[],
  tombstones: CustomFieldTombstone[],
  id: string
): {
  defs: CustomFieldDefinition[]
  tombstones: CustomFieldTombstone[]
  tombstone: CustomFieldTombstone
} | null {
  const target = defs.find((d) => d.id === id)
  if (!target || !target.archived) return null
  const tombstone: CustomFieldTombstone = {
    id,
    deletedAt: syncTimestamp(target.updatedAt),
    ...(target.legacyIds ? { legacyIds: target.legacyIds } : {}),
  }
  return {
    defs: defs.filter((d) => d.id !== id),
    tombstones: [...tombstones.filter((t) => t.id !== id), tombstone],
    tombstone,
  }
}

export function nextCustomFieldOrder(defs: CustomFieldDefinition[]): number {
  if (defs.length === 0) return 0
  return Math.max(...defs.map((d) => d.order)) + 1
}
