import { legacyDefinitionId } from '@/lib/legacyDefinitionId'
import { Contact } from '@/types/contact'
import { CustomFieldDefinition } from '@/types/customField'

export function migrateCustomFieldsToIds(args: {
  legacyLabels: string[]
  contacts: Contact[]
  deletedContacts: Contact[]
  now: number

  uuid?: () => string
}): {
  defs: CustomFieldDefinition[]
  contacts: Contact[]
  deletedContacts: Contact[]
} {
  const { legacyLabels, contacts, deletedContacts } = args
  const uuid = args.uuid

  const labelToId = new Map<string, string>()
  const defs: CustomFieldDefinition[] = []

  for (const raw of legacyLabels) {
    const label = typeof raw === 'string' ? raw.trim() : ''
    if (!label) continue
    if (labelToId.has(label)) continue
    const id = uuid?.() ?? legacyDefinitionId('field', label)
    labelToId.set(label, id)
    defs.push({
      id,
      label,
      order: defs.length,
      createdAt: 1,
      updatedAt: 1,
    })
  }

  const rewrite = (c: Contact): Contact => {
    if (!c.customFields) return c
    const entries = Object.entries(c.customFields)
    if (entries.length === 0) return c

    const out: Record<string, string> = {}
    let mutated = false

    for (const [label, value] of entries) {
      const trimmed = label.trim()
      if (!trimmed) {
        mutated = true
        continue
      }
      let id = labelToId.get(trimmed)
      if (!id) {
        id = uuid?.() ?? legacyDefinitionId('field', trimmed)
        labelToId.set(trimmed, id)
        defs.push({
          id,
          label: trimmed,
          order: defs.length,
          createdAt: 1,
          updatedAt: 1,
          archived: true,
        })
        mutated = true
      } else if (id !== label) {
        mutated = true
      }
      out[id] = value
    }

    if (!mutated) return c
    return { ...c, customFields: out }
  }

  return {
    defs,
    contacts: contacts.map(rewrite),
    deletedContacts: deletedContacts.map(rewrite),
  }
}
