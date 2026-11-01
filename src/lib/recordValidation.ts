import { z } from 'zod'

export const timestampSchema = z.number().finite().nonnegative()

export const dateStringSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)))

export const recordIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes('/') && !value.includes('\\') && !value.includes('..')
  )

export const bibleStudyFlagSchema = z
  .boolean()
  .nullish()
  .transform((value) => value ?? false)

export function hasUnsafeKeys(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, item]) =>
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      hasUnsafeKeys(item)
  )
}
