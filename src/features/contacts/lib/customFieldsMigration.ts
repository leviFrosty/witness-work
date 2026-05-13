import * as Crypto from 'expo-crypto'
import { Contact } from '@/types/contact'
import { CustomFieldDefinition } from '@/types/customField'

/**
 * One-time migration from the legacy custom-fields shape (label-keyed) to the
 * id-keyed shape with stable `CustomFieldDefinition` records.
 *
 * Legacy state: `preferences.customContactFields: string[]` held the global
 * list of labels; `contact.customFields: Record<string, string>` was keyed by
 * those same labels. Renaming a label silently orphaned every contact's value;
 * duplicate labels collided invisibly; reorder + sync had no stable identity.
 *
 * This pure function takes the legacy inputs and returns the new shape:
 *
 * - Each unique label (case-sensitive, in legacy array order) becomes a
 *   `CustomFieldDefinition` with a fresh UUID. Duplicates collapse to one.
 * - Every contact's `customFields` keys are rewritten label → id.
 * - **Orphan labels** (keys present on a contact but missing from the global
 *   array) become _archived_ defs with the orphan label, so the data is
 *   preserved. The user can review + restore them from the management screen.
 * - `updatedAt` is bumped only on contacts whose `customFields` actually changed
 *   shape, so untouched records keep their original timestamps and sync merges
 *   remain stable.
 *
 * Idempotent at the call site: the boot runner gates on
 * `preferences.hasMigratedCustomFieldsToIds`, so this function itself does not
 * try to detect already-migrated state.
 */
export function migrateCustomFieldsToIds(args: {
  legacyLabels: string[]
  contacts: Contact[]
  deletedContacts: Contact[]
  now: number
  /**
   * UUID generator. Defaults to `expo-crypto.randomUUID`. Injectable for tests
   * so assertions can pin specific ids.
   */
  uuid?: () => string
}): {
  defs: CustomFieldDefinition[]
  contacts: Contact[]
  deletedContacts: Contact[]
} {
  const { legacyLabels, contacts, deletedContacts, now } = args
  const uuid = args.uuid ?? (() => Crypto.randomUUID())

  const labelToId = new Map<string, string>()
  const defs: CustomFieldDefinition[] = []

  // Pass 1: collapse duplicates in the legacy preference array, preserving
  // first-occurrence order. Trim once on read; empty/whitespace labels are
  // dropped because they were already non-functional in the old UI.
  for (const raw of legacyLabels) {
    const label = typeof raw === 'string' ? raw.trim() : ''
    if (!label) continue
    if (labelToId.has(label)) continue
    const id = uuid()
    labelToId.set(label, id)
    defs.push({
      id,
      label,
      order: defs.length,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Pass 2: walk every contact and rewrite customFields keys label → id.
  // Orphan labels (on a contact but never in the prefs array) become archived
  // defs so the user's data isn't silently dropped — they can find and
  // restore them in the management screen.
  const rewrite = (c: Contact): Contact => {
    if (!c.customFields) return c
    const entries = Object.entries(c.customFields)
    if (entries.length === 0) return c

    const out: Record<string, string> = {}
    let mutated = false

    for (const [label, value] of entries) {
      const trimmed = label.trim()
      if (!trimmed) {
        // Empty key was always a bug. Drop it.
        mutated = true
        continue
      }
      let id = labelToId.get(trimmed)
      if (!id) {
        id = uuid()
        labelToId.set(trimmed, id)
        defs.push({
          id,
          label: trimmed,
          order: defs.length,
          createdAt: now,
          updatedAt: now,
          archived: true,
        })
        mutated = true
      } else if (id !== label) {
        // Same label, but key is now the id. Always a rewrite.
        mutated = true
      }
      out[id] = value
    }

    if (!mutated) return c
    return { ...c, customFields: out, updatedAt: now }
  }

  return {
    defs,
    contacts: contacts.map(rewrite),
    deletedContacts: deletedContacts.map(rewrite),
  }
}
