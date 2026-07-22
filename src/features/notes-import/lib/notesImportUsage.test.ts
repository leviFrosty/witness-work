import { describe, expect, it } from 'vitest'
import {
  notesImportCreditsForHash,
  normalizeNotesImportCredits,
  normalizeNotesImportStatus,
  shouldShowNotesImportSupporterCta,
} from '@/features/notes-import/lib/notesImportUsage'

const finiteSnapshot = {
  remaining: 3,
  limit: 5,
  resetsAt: '2026-08-14T12:00:00.000Z',
  isSupporter: false,
  refinements: { remaining: 2, limit: 5 },
}

describe('normalizeNotesImportCredits', () => {
  it('accepts the complete finite CreditsSnapshot unchanged before expiry', () => {
    expect(
      normalizeNotesImportCredits(finiteSnapshot, {
        now: Date.parse('2026-08-01T00:00:00.000Z'),
      })
    ).toEqual(finiteSnapshot)
  })

  it('accepts zero and unlimited allowances without inventing defaults', () => {
    expect(
      normalizeNotesImportCredits({
        remaining: 0,
        limit: 0,
        resetsAt: null,
        isSupporter: true,
        refinements: { remaining: 0, limit: 0 },
      })
    ).toEqual({
      remaining: 0,
      limit: 0,
      resetsAt: null,
      isSupporter: true,
      refinements: { remaining: 0, limit: 0 },
    })

    expect(
      normalizeNotesImportCredits({
        remaining: null,
        limit: null,
        resetsAt: null,
        isSupporter: false,
        refinements: { remaining: null, limit: null },
      })
    ).toEqual({
      remaining: null,
      limit: null,
      resetsAt: null,
      isSupporter: false,
      refinements: { remaining: null, limit: null },
    })
  })

  it('rejects the legacy response and missing nested refinement fields', () => {
    expect(
      normalizeNotesImportCredits({ remaining: 4, isSupporter: false })
    ).toBeNull()
    expect(
      normalizeNotesImportCredits({
        remaining: 4,
        limit: 5,
        resetsAt: null,
        isSupporter: false,
        refinements: { remaining: 3 },
      })
    ).toBeNull()
  })

  it.each([
    ['negative import value', { ...finiteSnapshot, remaining: -1 }],
    ['fractional import value', { ...finiteSnapshot, limit: 5.5 }],
    ['remaining above limit', { ...finiteSnapshot, remaining: 6 }],
    ['mixed import nullability', { ...finiteSnapshot, remaining: null }],
    [
      'mixed refinement nullability',
      {
        ...finiteSnapshot,
        refinements: { remaining: null, limit: 5 },
      },
    ],
    [
      'refinement remaining above limit',
      {
        ...finiteSnapshot,
        refinements: { remaining: 6, limit: 5 },
      },
    ],
    ['invalid reset timestamp', { ...finiteSnapshot, resetsAt: 'next month' }],
    [
      'invalid calendar date',
      { ...finiteSnapshot, resetsAt: '2026-02-31T12:00:00.000Z' },
    ],
    [
      'non-UTC reset timestamp',
      { ...finiteSnapshot, resetsAt: '2026-08-14T12:00:00+01:00' },
    ],
    [
      'reset on an unlimited allowance',
      { ...finiteSnapshot, remaining: null, limit: null },
    ],
    [
      'reset on a zero allowance',
      { ...finiteSnapshot, remaining: 0, limit: 0 },
    ],
  ])('rejects %s', (_label, snapshot) => {
    expect(normalizeNotesImportCredits(snapshot)).toBeNull()
  })

  it('normalizes an expired finite window at the exact boundary', () => {
    expect(
      normalizeNotesImportCredits(finiteSnapshot, {
        now: Date.parse(finiteSnapshot.resetsAt),
      })
    ).toEqual({ ...finiteSnapshot, remaining: 5, resetsAt: null })
  })

  it('normalizes an expired persisted window after the boundary', () => {
    expect(
      normalizeNotesImportCredits(finiteSnapshot, {
        now: Date.parse('2026-08-15T00:00:00.000Z'),
      })
    ).toEqual({ ...finiteSnapshot, remaining: 5, resetsAt: null })
  })

  it('treats allowance fields as authoritative despite Supporter status', () => {
    expect(
      normalizeNotesImportCredits({
        ...finiteSnapshot,
        isSupporter: true,
      })
    ).toEqual({ ...finiteSnapshot, isSupporter: true })

    expect(
      normalizeNotesImportCredits({
        ...finiteSnapshot,
        remaining: null,
        limit: null,
        resetsAt: null,
        isSupporter: false,
      })
    ).toEqual({
      ...finiteSnapshot,
      remaining: null,
      limit: null,
      resetsAt: null,
      isSupporter: false,
    })
  })
})

describe('normalizeNotesImportStatus', () => {
  const limits = {
    imports: { free: 5, supporter: null },
    refinements: { free: 0, supporter: 8 },
    windowDays: 30,
  }

  it('accepts the available schedule with finite, zero, and unlimited values', () => {
    expect(normalizeNotesImportStatus({ available: true, limits })).toEqual({
      available: true,
      limits,
    })
  })

  it('accepts positive fractional window days', () => {
    expect(
      normalizeNotesImportStatus({
        available: true,
        limits: { ...limits, windowDays: 0.25 },
      })
    ).toEqual({
      available: true,
      limits: { ...limits, windowDays: 0.25 },
    })
  })

  it('accepts an unavailable response without carrying an earlier schedule', () => {
    expect(
      normalizeNotesImportStatus({ available: false, reason: 'maintenance' })
    ).toEqual({ available: false, reason: 'maintenance' })
  })

  it.each([
    ['missing limits', { available: true }],
    [
      'server sentinel',
      {
        available: true,
        limits: { ...limits, imports: { free: -1, supporter: null } },
      },
    ],
    [
      'fractional allowance',
      {
        available: true,
        limits: { ...limits, refinements: { free: 2.5, supporter: 8 } },
      },
    ],
    ['zero window', { available: true, limits: { ...limits, windowDays: 0 } }],
    [
      'limits on unavailable response',
      { available: false, reason: 'disabled', limits },
    ],
  ])('rejects %s', (_label, status) => {
    expect(normalizeNotesImportStatus(status)).toBeNull()
  })
})

describe('shouldShowNotesImportSupporterCta', () => {
  it('uses real entitlement status, including unlimited development usage', () => {
    expect(shouldShowNotesImportSupporterCta({ isSupporter: false })).toBe(true)
    expect(shouldShowNotesImportSupporterCta({ isSupporter: true })).toBe(false)
  })
})

describe('notesImportCreditsForHash', () => {
  it('keeps global import fields while selecting refinements by content hash', () => {
    const refinementsByHash = {
      a: { remaining: 4, limit: 5 },
      b: { remaining: 1, limit: 5 },
    }

    expect(
      notesImportCreditsForHash(finiteSnapshot, refinementsByHash, 'a')
    ).toEqual({
      ...finiteSnapshot,
      refinements: { remaining: 4, limit: 5 },
    })
    expect(
      notesImportCreditsForHash(finiteSnapshot, refinementsByHash, 'b')
    ).toEqual({
      ...finiteSnapshot,
      refinements: { remaining: 1, limit: 5 },
    })
  })

  it('does not fall back to another import’s refinement balance', () => {
    expect(
      notesImportCreditsForHash(
        finiteSnapshot,
        { b: { remaining: 1, limit: 5 } },
        'a'
      )
    ).toBeNull()
  })
})
