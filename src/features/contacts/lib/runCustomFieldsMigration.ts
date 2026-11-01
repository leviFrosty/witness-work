import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import { migrateCustomFieldsToIds } from '@/features/contacts/lib/customFieldsMigration'

export function runCustomFieldsMigration() {
  const prefs = usePreferences.getState()
  if (prefs.hasMigratedCustomFieldsToIds) return

  const contactsState = useContacts.getState()
  if (
    contactsState.customFieldDefs.length > 0 ||
    contactsState.deletedCustomFieldDefs.length > 0
  ) {
    usePreferences.setState({ hasMigratedCustomFieldsToIds: true })
    return
  }

  const legacyLabels = ((prefs as unknown as { customContactFields?: string[] })
    .customContactFields ?? []) as string[]

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

  usePreferences.setState({
    hasMigratedCustomFieldsToIds: true,

    ...({ customContactFields: undefined } as Record<string, unknown>),
  } as never)
}
