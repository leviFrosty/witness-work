import { describe, expect, it } from 'vitest'
import {
  getContactInformationFields,
  hasContactInformationValue,
} from '@/lib/contactInformationFields'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Contact } from '@/types/contact'

const spouse: CustomFieldDefinition = {
  id: 'spouse',
  label: 'Spouse',
  order: 1,
  createdAt: 1,
  updatedAt: 1,
}
const language: CustomFieldDefinition = {
  id: 'language',
  label: 'Language',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
}
const ids = (fields: ReturnType<typeof getContactInformationFields>) =>
  fields.map((field) => field.id)

describe('contact information presentation', () => {
  it('preserves the existing default layout for users without saved preferences', () => {
    expect(ids(getContactInformationFields([spouse, language]))).toEqual([
      'phone',
      'email',
      'custom:language',
      'custom:spouse',
    ])
  })

  it('interleaves built-ins and custom fields and appends newly added fields', () => {
    expect(
      ids(
        getContactInformationFields(
          [spouse, language],
          ['custom:spouse', 'email', 'phone']
        )
      )
    ).toEqual(['custom:spouse', 'email', 'phone', 'custom:language'])
  })

  it('hides built-ins without losing their values or position when shown again', () => {
    const order = ['email', 'custom:spouse', 'phone']
    const contact: Contact = {
      id: 'contact',
      name: 'Example',
      createdAt: new Date(),
      phone: '5551234567',
      email: 'test@example.com',
      customFields: { spouse: 'Example' },
    }
    const hidden = getContactInformationFields([spouse], order, {
      phone: false,
      email: false,
    })
    expect(ids(hidden)).toEqual(['custom:spouse'])
    expect(
      hidden.every((field) => hasContactInformationValue(contact, field))
    ).toBe(true)
    const restored = getContactInformationFields([spouse], order)
    expect(ids(restored)).toEqual(order)
    expect(
      restored.every((field) => hasContactInformationValue(contact, field))
    ).toBe(true)
    expect(contact.phone).toBe('5551234567')
    expect(contact.email).toBe('test@example.com')
  })

  it('ignores archived, removed, and duplicate keys while supporting restored fields', () => {
    const order = ['custom:spouse', 'phone', 'phone', 'custom:removed', 'email']
    expect(
      ids(getContactInformationFields([{ ...spouse, archived: true }], order))
    ).toEqual(['phone', 'email'])
    expect(ids(getContactInformationFields([spouse], order))).toEqual([
      'custom:spouse',
      'phone',
      'email',
    ])
  })

  it('does not show a details row for missing values', () => {
    const contact: Contact = {
      id: 'empty',
      name: 'Example',
      createdAt: new Date(),
    }
    expect(
      getContactInformationFields([spouse]).filter((field) =>
        hasContactInformationValue(contact, field)
      )
    ).toEqual([])
    expect(
      getContactInformationFields([], [], { phone: false, email: false })
    ).toEqual([])
  })
})
