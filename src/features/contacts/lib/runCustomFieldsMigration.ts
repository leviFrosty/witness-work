import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import { migrateCustomFieldsToIds } from '@/features/contacts/lib/customFieldsMigration'

export function runCustomFieldsMigration() {
  const prefs = usePreferences.getState()
  if (prefs.hasMigratedCustomFieldsToIds) return

  // The legacy field was removed from the type; read it from the persisted
  // state where it may still live as an unknown key.
  const legacyLabels = ((prefs as unknown as { customContactFields?: string[] })
    .customContactFields ?? []) as string[]

  const contactsState = useContacts.getState()
  const result = migrateCustomFieldsToIds({
    legacyLabels,
    contacts: contactsState.contacts,
    deletedContacts: contactsState.deletedContacts,
    now: Date.now(),
  })

  useContacts.setState({
    contacts: result.contacts,
    deletedContacts: result.deletedContacts,
    customFieldDefs: result.defs,
  })

  // Use raw setState to bypass the syncing wrapper — we don't want the
  // legacy-field cleanup to stamp `preferenceUpdatedAt`. The migration
  // flag is in NON_SYNCABLE so it would already be skipped, but keeping
  // both writes raw makes intent explicit.
  usePreferences.setState({
    hasMigratedCustomFieldsToIds: true,
    // Drop the legacy field from in-memory state so it stops appearing in
    // future persist writes (JSON.stringify drops undefined values).
    ...({ customContactFields: undefined } as Record<string, unknown>),
  } as never)
}
