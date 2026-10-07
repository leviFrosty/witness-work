import { z } from 'zod'

/**
 * Validation primitives shared by every reader of untrusted record data: the
 * iCloud sync payload (`app/sync/payloadValidation`) and shared-contact imports
 * (`features/contacts/lib/contactShareFormat`).
 */

/** Epoch milliseconds. */
export const timestampSchema = z.number().finite().nonnegative()

/** A date string `Date.parse` understands, as JSON carries `Date`s. */
export const dateStringSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)))

/**
 * A record id. Ids name files (contact avatars, iCloud image copies), so one
 * can never be a path.
 */
export const recordIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes('/') && !value.includes('\\') && !value.includes('..')
  )

/** Reject unsafe dictionary keys before legacy transforms or store writes. */
export function hasUnsafeKeys(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, item]) =>
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      hasUnsafeKeys(item)
  )
}
