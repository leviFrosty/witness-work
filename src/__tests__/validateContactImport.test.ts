import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(),
}))

vi.mock('react-native', () => ({
  Alert: {
    alert: vi.fn(),
  },
  Platform: {
    OS: 'ios',
  },
}))

vi.mock('@/lib/locales', () => ({
  default: {
    t: vi.fn((key: string) => key),
  },
}))

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  validateContactImport,
  processContactImport,
  ContactImportData,
} from '@/features/contacts/lib/contactImport'
import { stripContactForTombstone } from '@/lib/dataProtection'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import i18n from '@/lib/locales'

const mockI18n = vi.mocked(i18n)

describe('validateContactImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockI18n.t.mockImplementation((key: string) => key)
  })

  const createValidImportData = (
    contact?: Partial<Contact>,
    conversations?: Visit[]
  ): ContactImportData => {
    const fakeContact: Contact = {
      id: '123',
      name: 'John Doe',
      createdAt: new Date('2023-01-01'),
      address: {
        line1: '123 Some St',
        city: 'Cincinnati',
        state: 'OH',
        country: 'USA',
        zip: '41017',
      },
      email: 'example@test.com',
      phone: '+1 (888) 123-5555',
    }
    return JSON.parse(
      JSON.stringify({
        version: '1.0',
        type: 'witnesswork-contact',
        exportedAt: new Date().toISOString(),
        contact: { ...fakeContact, ...contact },
        conversations,
      })
    )
  }

  describe('valid data', () => {
    it('should return success for valid import data', () => {
      const validData = createValidImportData()
      const result = validateContactImport(validData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
      expect(result.error).toBeUndefined()
    })

    it('should return success for valid import data with conversations', () => {
      const conversations: Visit[] = [
        {
          id: 'conv-1',
          contact: { id: 'contact-123' },
          date: new Date(),
          isBibleStudy: false,
          note: 'Test conversation',
        },
      ]
      const validData = createValidImportData(undefined, conversations)
      const result = validateContactImport(validData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
      expect(result.error).toBeUndefined()
    })

    it('should return success for valid import data without optional fields', () => {
      const minimalContact = {
        id: 'test-id',
        name: 'Test Name',
        createdAt: new Date(),
      }
      const validData = createValidImportData(minimalContact)
      const result = validateContactImport(validData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
      expect(result.error).toBeUndefined()
    })
  })

  describe('invalid data types', () => {
    it('should return error for null data', () => {
      const result = validateContactImport(null)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for undefined data', () => {
      const result = validateContactImport(undefined)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for string data', () => {
      const result = validateContactImport('invalid string data')

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for number data', () => {
      const result = validateContactImport(12345)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for boolean data', () => {
      const result = validateContactImport(true)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for array data', () => {
      const result = validateContactImport(['invalid', 'array', 'data'])

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })
  })

  describe('invalid object structure', () => {
    it('should return error for empty object', () => {
      const result = validateContactImport({})

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for invalid type field', () => {
      const invalidData = {
        type: 'invalid-type',
        contact: {
          id: 'test-id',
          name: 'Test Name',
          createdAt: new Date(),
        },
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for missing type field', () => {
      const invalidData = {
        version: '1.0',
        contact: {
          id: 'test-id',
          name: 'Test Name',
          createdAt: new Date(),
        },
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for wrong type field type', () => {
      const invalidData = {
        type: 12345,
        contact: {
          id: 'test-id',
          name: 'Test Name',
          createdAt: new Date(),
        },
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for missing contact field', () => {
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        exportedAt: new Date().toISOString(),
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for null contact field', () => {
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: null,
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })
  })

  describe('invalid contact structure', () => {
    it('should return error for contact missing id', () => {
      const invalidContact = {
        name: 'Test Name',
        createdAt: new Date(),
      }
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: invalidContact,
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for contact missing name', () => {
      const invalidContact = {
        id: 'test-id',

        createdAt: new Date(),
      }
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: invalidContact,
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for contact missing createdAt', () => {
      const invalidContact = {
        id: 'test-id',
        name: 'Test Name',
      }
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: invalidContact,
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for contact with empty string id', () => {
      const invalidContact = {
        id: '',
        name: 'Test Name',
        createdAt: new Date(),
      }
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: invalidContact,
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for contact with empty string name', () => {
      const invalidContact = {
        id: 'test-id',
        name: '',
        createdAt: new Date(),
      }
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: invalidContact,
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for contact with null values', () => {
      const invalidContact = {
        id: null,
        name: null,
        createdAt: null,
      }
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: invalidContact,
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should return error for contact that is not an object', () => {
      const invalidData = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: 'not an object',
      }
      const result = validateContactImport(invalidData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle unexpected errors gracefully', () => {
      const problematicData = {
        type: 'witnesswork-contact',
        contact: {
          get id() {
            throw new Error('Unexpected error')
          },
          name: 'Test Name',
          createdAt: new Date(),
        },
      }

      const result = validateContactImport(problematicData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalidFile_description')
      expect(result.data).toBeUndefined()
    })

    it('should call i18n.t for error messages', () => {
      validateContactImport(null)

      expect(mockI18n.t).toHaveBeenCalledWith('invalidFile_description')
    })

    it('should use the same error message for all validation failures', () => {
      const testCases = [
        null,
        undefined,
        'string',
        123,
        true,
        [],
        {},
        { type: 'wrong-type' },
        { type: 'witnesswork-contact' },
        { type: 'witnesswork-contact', contact: {} },
      ]

      testCases.forEach((testCase) => {
        const result = validateContactImport(testCase)
        expect(result.success).toBe(false)
        expect(result.error).toBe('invalidFile_description')
      })

      expect(mockI18n.t).toHaveBeenCalledTimes(testCases.length)
    })
  })

  describe('avatar sanitization (security)', () => {
    it('strips image avatars from imported contacts', () => {
      const malicious = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: {
          id: 'evil-1',
          name: 'Bob Smith',
          createdAt: '2026-01-01T00:00:00.000Z',
          avatar: {
            type: 'image',
            value:
              'file:///var/mobile/Containers/Data/Application/UUID/Documents/mmkv-secret',
          },
          avatarMeta: {
            width: 1,
            height: 1,
          },
        },
      }
      const result = validateContactImport(malicious)

      expect(result.success).toBe(true)

      expect(result.data?.contact.avatar).toBeUndefined()
      expect(result.data?.contact.avatarMeta).toBeUndefined()
    })

    it('strips image avatars even with an icloud:// marker value', () => {
      const payload = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: {
          id: 'evil-2',
          name: 'Bob Smith',
          createdAt: '2026-01-01T00:00:00.000Z',
          avatar: { type: 'image', value: 'icloud://contact-evil-2' },
        },
      }
      const result = validateContactImport(payload)

      expect(result.success).toBe(true)
      expect(result.data?.contact.avatar).toBeUndefined()
    })

    it('drops emoji avatars too; the recipient picks their own', () => {
      const payload = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: {
          id: 'friendly-1',
          name: 'Bob Smith',
          createdAt: '2026-01-01T00:00:00.000Z',
          avatar: { type: 'emoji', value: '🌱' },
        },
      }
      const result = validateContactImport(payload)

      expect(result.success).toBe(true)
      expect(result.data?.contact.avatar).toBeUndefined()
    })

    it('drops "none" avatars on imported contacts', () => {
      const payload = {
        type: 'witnesswork-contact',
        version: '1.0',
        contact: {
          id: 'friendly-2',
          name: 'Bob Smith',
          createdAt: '2026-01-01T00:00:00.000Z',
          avatar: { type: 'none', value: '' },
        },
      }
      const result = validateContactImport(payload)

      expect(result.success).toBe(true)
      expect(result.data?.contact.avatar).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('drops contact fields outside the share format', () => {
      const validData = createValidImportData()
      const contactWithExtraFields = {
        ...validData.contact,
        extraField: 'this should not cause validation to fail',
        anotherField: 12345,
      }
      const dataWithExtraFields = {
        ...validData,
        contact: contactWithExtraFields,
      }
      const result = validateContactImport(dataWithExtraFields)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('drops root fields outside the share format', () => {
      const validData = createValidImportData()
      const result = validateContactImport({
        ...validData,
        extraRootField: 'this should not cause validation to fail',
        metadata: { someInfo: 'test' },
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('rejects ids and names over the share limits', () => {
      const longString = 'a'.repeat(10000)
      for (const contact of [{ id: longString }, { name: longString }]) {
        const result = validateContactImport(createValidImportData(contact))
        expect(result.success).toBe(false)
        expect(result.error).toBe('invalidFile_description')
      }
    })

    it('should handle different date formats in createdAt', () => {
      const validData = createValidImportData()
      const dataWithStringDate = {
        ...validData,
        contact: {
          ...validData.contact,
          createdAt: '2023-01-01T00:00:00.000Z' as unknown as Date,
        },
      }
      const result = validateContactImport(dataWithStringDate)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(dataWithStringDate)
    })
  })
})

describe('processContactImport', () => {
  const shared: Contact = {
    id: 'shared-1',
    name: 'John Doe',
    createdAt: new Date('2023-01-01'),
  }
  const importData: ContactImportData = {
    version: '1.0',
    type: 'witnesswork-contact',
    exportedAt: '2026-10-01T00:00:00.000Z',
    contact: shared,
  }

  it('offers to recover a contact waiting in Recover Contacts', () => {
    const result = processContactImport(importData, [], [shared])
    expect(result.isDeleted).toBe(true)
    expect(result.deletedContact).toBe(shared)
  })

  it('imports afresh over a permanently deleted contact', () => {
    const tombstone = stripContactForTombstone(shared, 1)
    const result = processContactImport(importData, [], [tombstone])
    expect(result.isDeleted).toBe(false)
    expect(result.deletedContact).toBeUndefined()
    expect(result.conflictExists).toBe(false)
  })
})
