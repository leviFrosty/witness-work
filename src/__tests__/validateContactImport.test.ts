import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock all dependencies first before any imports
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(),
}))

vi.mock('expo-file-system', () => ({
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

vi.mock('../lib/locales', () => ({
  default: {
    t: vi.fn((key: string) => key),
  },
}))

// Mock the logger to avoid MMKV dependencies in tests
vi.mock('../lib/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// Now import after all mocks are set up
import { validateContactImport, ContactImportData } from '../lib/contactImport'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import i18n from '../lib/locales'

const mockI18n = vi.mocked(i18n)

describe('validateContactImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockI18n.t.mockImplementation((key: string) => key)
  })

  // Helper to create valid import data
  const createValidImportData = (
    contact?: Partial<Contact>,
    conversations?: Conversation[]
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
    return {
      version: '1.0',
      type: 'witnesswork-contact',
      exportedAt: new Date().toISOString(),
      contact: { ...fakeContact, ...contact },
      conversations,
    }
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
      const conversations: Conversation[] = [
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
        type: 12345, // should be string
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
        // id: 'missing-id',
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
        // name: 'missing-name',
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
        // createdAt: new Date(),
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
        id: '', // empty string
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
        name: '', // empty string
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
      // Create an object that will cause an error during processing
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
        { type: 'witnesswork-contact' }, // missing contact
        { type: 'witnesswork-contact', contact: {} }, // missing required contact fields
      ]

      testCases.forEach((testCase) => {
        const result = validateContactImport(testCase)
        expect(result.success).toBe(false)
        expect(result.error).toBe('invalidFile_description')
      })

      // Verify i18n.t was called the expected number of times
      expect(mockI18n.t).toHaveBeenCalledTimes(testCases.length)
    })
  })

  describe('edge cases', () => {
    it('should accept contact with extra fields', () => {
      // Create valid data first, then add extra fields to the contact object directly
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
      expect(result.data).toEqual(dataWithExtraFields)
    })

    it('should accept import data with extra root fields', () => {
      const validData = {
        ...createValidImportData(),
        extraRootField: 'this should not cause validation to fail',
        metadata: { someInfo: 'test' },
      }
      const result = validateContactImport(validData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should handle very long strings in required fields', () => {
      const longString = 'a'.repeat(10000)
      const contactWithLongStrings = {
        id: longString,
        name: longString,
      }

      const validData = createValidImportData(contactWithLongStrings)
      const result = validateContactImport(validData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should handle different date formats in createdAt', () => {
      // Create valid data first, then modify the contact to have a string date
      const validData = createValidImportData()
      const dataWithStringDate = {
        ...validData,
        contact: {
          ...validData.contact,
          createdAt: '2023-01-01T00:00:00.000Z' as unknown as Date, // string instead of Date object
        },
      }
      const result = validateContactImport(dataWithStringDate)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(dataWithStringDate)
    })
  })
})
