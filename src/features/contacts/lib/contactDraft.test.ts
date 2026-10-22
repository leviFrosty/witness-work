import { describe, expect, it } from 'vitest'

import { contactDraftForChanges } from '@/features/contacts/lib/contactDraft'
import type { Contact } from '@/types/contact'

const saved: Contact = {
  id: 'c1',
  name: 'Dana Reed',
  createdAt: new Date(2024, 0, 1),
  phone: '+14155551003',
}

describe('contactDraftForChanges', () => {
  it('ignores the region the phone field fills in for a contact without one', () => {
    const draft = { ...saved, phoneRegionCode: 'US' }
    expect(contactDraftForChanges(draft, saved)).toEqual(saved)
  })

  it('counts a new region once the phone number changes', () => {
    const draft = { ...saved, phone: '+442071234567', phoneRegionCode: 'GB' }
    expect(contactDraftForChanges(draft, saved)).toBe(draft)
  })

  it('counts a changed region for a contact that had one', () => {
    const withRegion = { ...saved, phoneRegionCode: 'US' }
    const draft = { ...withRegion, phoneRegionCode: 'CA' }
    expect(contactDraftForChanges(draft, withRegion)).toBe(draft)
  })

  it('leaves a new contact as it is', () => {
    const draft = { ...saved, phoneRegionCode: 'US' }
    expect(contactDraftForChanges(draft, undefined)).toBe(draft)
  })
})
