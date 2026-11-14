import type { JSONSchema7 } from 'ai'
import { NOTES_IMPORT_SCHEMA, notesImportResultValidator } from './schema'

const contract = NOTES_IMPORT_SCHEMA as unknown as JSONSchema7

/** Azure strict output requires every property; absent optional values use null. */
const strictSchema = (schema: JSONSchema7): JSONSchema7 => {
  if (schema.properties) {
    const required = new Set(schema.required ?? [])
    return {
      ...schema,
      required: Object.keys(schema.properties),
      properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => {
        const child = strictSchema(value as JSONSchema7)
        return [key, required.has(key) ? child : { anyOf: [child, { type: 'null' }] }]
      })),
    }
  }
  if (schema.items) return { ...schema, items: strictSchema(schema.items as JSONSchema7) }
  return schema
}

/** Model-only shape; the public DTO continues to omit unknown optional fields. */
export const NOTES_IMPORT_MODEL_SCHEMA = strictSchema(contract)

const omitOptionalNulls = (value: unknown, schema: JSONSchema7): unknown => {
  if (Array.isArray(value) && schema.items) {
    return value.map(item => omitOptionalNulls(item, schema.items as JSONSchema7))
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !schema.properties) {
    return value
  }
  const required = new Set(schema.required ?? [])
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const property = schema.properties![key]
    // Unknown fields and required nulls remain for the canonical validator to
    // reject. In particular, publisher:null is a meaningful required value.
    if (!Object.hasOwn(schema.properties!, key)) return [[key, child]]
    if (child === null && !required.has(key)) return []
    return [[key, omitOptionalNulls(child, property as JSONSchema7)]]
  }))
}

export const parseNotesImportModelResult = (value: unknown) =>
  notesImportResultValidator.safeParse(omitOptionalNulls(value, contract))
