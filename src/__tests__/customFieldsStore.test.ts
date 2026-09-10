import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated-field' }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useContacts from '@/stores/contactsStore'
import type { Contact } from '@/types/contact'
import type { CustomFieldDefinition } from '@/types/customField'

const field: CustomFieldDefinition = {
  id: 'field-language',
  label: 'Language',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  archived: true,
}

const otherField: CustomFieldDefinition = {
  id: 'field-notes',
  label: 'Notes',
  order: 1,
  createdAt: 1,
  updatedAt: 1,
}

const contact = (
  id: string,
  customFields?: Record<string, string>
): Contact => ({
  id,
  name: id,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  customFields,
})

beforeEach(() => {
  useContacts.getState().set({
    contacts: [],
    deletedContacts: [],
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  })
})

describe('custom field purge', () => {
  it('removes only the deleted field from active and deleted contacts', () => {
    const activeWithValue = contact('active-with-value', {
      [field.id]: 'Spanish',
      [otherField.id]: 'Keep me',
    })
    const activeWithoutValue = contact('active-without-value', {
      [otherField.id]: 'Keep me too',
    })
    const deletedWithValue = contact('deleted-with-value', {
      [field.id]: 'French',
      [otherField.id]: 'Keep me',
    })
    useContacts.getState().set({
      contacts: [activeWithValue, activeWithoutValue],
      deletedContacts: [deletedWithValue],
      customFieldDefs: [field, otherField],
    })

    useContacts.getState().purgeCustomFieldDef(field.id)

    const state = useContacts.getState()
    expect(state.customFieldDefs).toEqual([otherField])
    expect(state.deletedCustomFieldDefs).toHaveLength(1)
    expect(state.deletedCustomFieldDefs[0].id).toBe(field.id)
    expect(state.contacts).toMatchObject([
      { id: activeWithValue.id, customFields: { [otherField.id]: 'Keep me' } },
      {
        id: activeWithoutValue.id,
        customFields: { [otherField.id]: 'Keep me too' },
      },
    ])
    expect(state.deletedContacts).toMatchObject([
      { id: deletedWithValue.id, customFields: { [otherField.id]: 'Keep me' } },
    ])
  })

  it('does not purge an active definition through the destructive action', () => {
    useContacts.getState().set({
      customFieldDefs: [otherField],
    })

    useContacts.getState().purgeCustomFieldDef(otherField.id)

    expect(useContacts.getState().customFieldDefs).toEqual([otherField])
    expect(useContacts.getState().deletedCustomFieldDefs).toEqual([])
  })

  it('blocks tombstoned values at contact and import boundaries', () => {
    useContacts.getState().set({
      deletedCustomFieldDefs: [{ id: field.id, deletedAt: Date.now() }],
      customFieldDefs: [],
    })

    useContacts.getState().addContact(
      contact('new-contact', {
        [field.id]: 'stale',
        [otherField.id]: 'preserved',
      })
    )
    useContacts.getState().updateContact({
      id: 'new-contact',
      customFields: {
        [field.id]: 'stale update',
        [otherField.id]: 'preserved update',
      },
    })
    useContacts.getState().mergeIncomingCustomFieldDefs([field, otherField])

    const state = useContacts.getState()
    expect(state.customFieldDefs).toMatchObject([{ ...otherField, order: 0 }])
    expect(state.contacts[0].customFields).toEqual({
      [otherField.id]: 'preserved update',
    })
  })

  it('allows explicit import undo to be re-imported without a tombstone', () => {
    useContacts.getState().set({ customFieldDefs: [otherField] })

    useContacts.getState().removeCustomFieldDefForUndo(otherField.id)
    useContacts.getState().mergeIncomingCustomFieldDefs([otherField])

    expect(useContacts.getState().customFieldDefs).toMatchObject([
      { ...otherField, order: 0 },
    ])
    expect(useContacts.getState().deletedCustomFieldDefs).toEqual([])
  })
})
