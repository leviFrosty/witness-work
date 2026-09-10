import type { CustomFieldDefinition } from '@/types/customField'
import type { Contact } from '@/types/contact'

export type ContactInformationField =
  | { id: 'phone' | 'email'; kind: 'phone' | 'email' }
  | { id: string; kind: 'custom'; definition: CustomFieldDefinition }

/**
 * Resolve saved order against today's definitions, including newly added
 * fields.
 */
export function getContactInformationFields(
  definitions: CustomFieldDefinition[],
  savedOrder: readonly string[] = [],
  visibility = { phone: true, email: true }
): ContactInformationField[] {
  const fields: ContactInformationField[] = [
    { id: 'phone', kind: 'phone' },
    { id: 'email', kind: 'email' },
    ...definitions
      .filter((definition) => !definition.archived)
      .sort((a, b) => a.order - b.order)
      .map((definition) => ({
        id: `custom:${definition.id}`,
        kind: 'custom' as const,
        definition,
      })),
  ]
  const byId = new Map(fields.map((field) => [field.id, field]))
  return [
    ...new Set([...savedOrder, ...fields.map((field) => field.id)]),
  ].flatMap((id) => {
    const field = byId.get(id)
    if (!field || (field.kind !== 'custom' && !visibility[field.kind])) {
      return []
    }
    return [field]
  })
}

export function hasContactInformationValue(
  contact: Contact,
  field: ContactInformationField
): boolean {
  return Boolean(
    field.kind === 'custom'
      ? contact.customFields?.[field.definition.id]
      : contact[field.kind]
  )
}
