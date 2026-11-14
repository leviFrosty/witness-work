import { describe, expect, it } from 'vitest'
import type { JSONSchema7 } from 'ai'
import { NOTES_IMPORT_MODEL_SCHEMA, parseNotesImportModelResult } from './modelSchema'

const result = {
  contacts: [{ tempId: 'c1', name: 'Jordan', phone: null, gender: null,
    address: { line1: '14 Maple Street', city: null }, note: null }],
  visits: [{ date: '2026-10-02', isBibleStudy: false, contactId: null,
    contactTempId: 'c1', notAtHome: false, followUp: { date: '2026-10-09', topic: null } }],
  timeEntries: [{ date: '2026-10-01', hours: 1, minutes: 30, categoryId: null, credit: null }],
  categories: [], publisher: null, warnings: [], summary: 'October service', assistantMessage: '',
}

describe('Azure strict model schema', () => {
  it('requires every property in every nested object and closes extra properties', () => {
    const check = (schema: JSONSchema7) => {
      if (schema.properties) {
        expect(schema.required).toEqual(Object.keys(schema.properties))
        expect(schema.additionalProperties).toBe(false)
        for (const child of Object.values(schema.properties)) check(child as JSONSchema7)
      }
      if (schema.items) check(schema.items as JSONSchema7)
      for (const child of schema.anyOf ?? []) check(child as JSONSchema7)
    }
    check(NOTES_IMPORT_MODEL_SCHEMA)
  })

  it('makes an optional enum and nested object nullable without weakening required fields', () => {
    const contact = (NOTES_IMPORT_MODEL_SCHEMA.properties!.contacts as JSONSchema7).items as JSONSchema7
    expect(contact.properties!.gender).toMatchObject({ anyOf: [
      { type: 'string', enum: ['male', 'female', 'unknown'] }, { type: 'null' },
    ] })
    expect(contact.properties!.address).toMatchObject({ anyOf: [
      { type: 'object', required: ['line1', 'line2', 'city', 'state', 'zip', 'country'] },
      { type: 'null' },
    ] })
    expect(contact.properties!.name).toEqual({ type: 'string' })
  })

  it('omits only optional nulls before validating the unchanged public DTO', () => {
    const parsed = parseNotesImportModelResult(result)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.contacts[0]).toEqual({ tempId: 'c1', name: 'Jordan', address: { line1: '14 Maple Street' } })
    expect(parsed.data.visits[0]).toEqual({ date: '2026-10-02', isBibleStudy: false,
      contactTempId: 'c1', notAtHome: false, followUp: { date: '2026-10-09' } })
    expect(parsed.data.timeEntries[0]).toEqual({ date: '2026-10-01', hours: 1, minutes: 30 })
    expect(parsed.data.publisher).toBeNull()
    expect(result.contacts[0].phone).toBeNull()
  })

  it.each([
    { ...result, contacts: [{ tempId: 'c1', name: null }] },
    { ...result, visits: [{ date: '2026-10-02', isBibleStudy: null }] },
    { ...result, contacts: [{ tempId: 'c1', name: 'Jordan', privateField: null }] },
    { ...result, contacts: [{ tempId: 'c1', name: 'Jordan', constructor: null }] },
    { ...result, contacts: [{ tempId: 'c1', name: 'Jordan', address: { unknown: null } }] },
    { ...result, timeEntries: [{ date: '2026-10-01', hours: 0, minutes: 90 }] },
  ])('still rejects invalid required values, extra fields, and durations', invalid => {
    expect(parseNotesImportModelResult(invalid).success).toBe(false)
  })
})
