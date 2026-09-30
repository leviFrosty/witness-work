import type { Contact } from '@/types/contact'
import { canonicalJson } from '@/lib/canonicalJson'

/** Late geocodes apply only while the requested address and pin are current. */
export function mayApplyGeocode(
  requested: Contact,
  current: Contact | undefined
): boolean {
  return (
    !!current &&
    !current.userDraggedCoordinate &&
    canonicalJson(current.address) === canonicalJson(requested.address) &&
    canonicalJson(current.coordinate) === canonicalJson(requested.coordinate)
  )
}

/** Patch only fields the user changed while a form was open. */
export function contactEditPatch(
  original: Contact,
  edited: Contact,
  current: Contact = original
): Partial<Contact> & { id: string } {
  const patch: Record<string, unknown> & { id: string } = { id: edited.id }
  for (const key of new Set([
    ...Object.keys(original),
    ...Object.keys(edited),
  ])) {
    if (key === 'id' || key === 'updatedAt') continue
    const before = original[key as keyof Contact],
      after = edited[key as keyof Contact]
    if (canonicalJson(before) === canonicalJson(after)) continue
    if (
      (key === 'customFields' || key === 'address') &&
      after &&
      typeof after === 'object'
    ) {
      const oldMap = (before ?? {}) as Record<string, unknown>
      const newMap = after as Record<string, unknown>
      const merged = { ...(current[key] ?? {}) } as Record<string, unknown>
      for (const field of new Set([
        ...Object.keys(oldMap),
        ...Object.keys(newMap),
      ])) {
        if (canonicalJson(oldMap[field]) === canonicalJson(newMap[field]))
          continue
        if (newMap[field] === undefined) delete merged[field]
        else merged[field] = newMap[field]
      }
      patch[key] = merged
    } else patch[key] = after
  }
  return patch
}
