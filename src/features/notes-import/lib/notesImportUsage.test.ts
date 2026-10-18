import { describe, expect, it } from 'vitest'
import {
  accountUsageCredits,
  normalizeNotesImportAccountUsage,
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
      normalizeNotesImportCredits(
        {
          ...finiteSnapshot,
          isSupporter: true,
        },
        { now: Date.parse('2026-08-01T00:00:00.000Z') }
      )
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

  it('surfaces Play Integrity support only for a well-formed capability', () => {
    const capabilities = (playIntegrity: unknown) => ({
      available: true,
      limits,
      capabilities: { appAttest: { protocolVersions: [1, 2] }, playIntegrity },
    })
    expect(
      normalizeNotesImportStatus(
        capabilities({ protocolVersions: [1], cloudProjectNumber: '1234' })
      )
    ).toEqual({ available: true, limits, playIntegrity: true })
    for (const malformed of [
      undefined,
      { protocolVersions: [2], cloudProjectNumber: '1234' },
      { protocolVersions: [1] },
      'yes',
    ]) {
      expect(normalizeNotesImportStatus(capabilities(malformed))).toEqual({
        available: true,
        limits,
      })
    }
  })

  it('surfaces Import from Paper only for a well-formed capability', () => {
    const withTranscribe = (transcribe: unknown) => ({
      available: true,
      limits,
      capabilities: { appAttest: { protocolVersions: [1, 2] }, transcribe },
    })
    expect(
      normalizeNotesImportStatus(
        withTranscribe({ maxPages: 10, maxBytes: 4_194_304 })
      )
    ).toEqual({ available: true, limits, transcribe: { maxPages: 10 } })
    for (const malformed of [
      undefined,
      { maxPages: 0 },
      { maxPages: 2.5 },
      'yes',
    ]) {
      expect(normalizeNotesImportStatus(withTranscribe(malformed))).toEqual({
        available: true,
        limits,
      })
    }
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

  it('carries a well-formed minAppVersion on either state', () => {
    expect(
      normalizeNotesImportStatus({
        available: true,
        limits,
        minAppVersion: '1.42.0',
      })
    ).toEqual({ available: true, limits, minAppVersion: '1.42.0' })
    expect(
      normalizeNotesImportStatus({
        available: false,
        reason: 'disabled',
        minAppVersion: '1.42.0',
      })
    ).toEqual({ available: false, reason: 'disabled', minAppVersion: '1.42.0' })
  })

  it('drops a malformed minAppVersion without rejecting the status', () => {
    expect(
      normalizeNotesImportStatus({
        available: true,
        limits,
        minAppVersion: 'v1.42',
      })
    ).toEqual({ available: true, limits })
    expect(
      normalizeNotesImportStatus({
        available: true,
        limits,
        minAppVersion: 142,
      })
    ).toEqual({ available: true, limits })
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

describe('the account usage answer (GET /notes-import/usage)', () => {
  const answer = {
    ok: true,
    accountStatus: 'active',
    supporter: false,
    supporterCheckFailed: false,
    imports: {
      limit: 3,
      used: 1,
      remaining: 2,
      resetsAt: '2026-11-17T12:00:00.000Z',
    },
    refinements: { limitPerImport: 5 },
    windowDays: 30,
  }
  const now = Date.parse('2026-10-18T12:00:00.000Z')

  it('reads the account’s allowance', () => {
    expect(normalizeNotesImportAccountUsage(answer)).toEqual({
      supporter: false,
      supporterCheckFailed: false,
      accountStatus: 'active',
      imports: answer.imports,
      refinementsPerImport: 5,
      windowDays: 30,
    })
  })

  it('refuses a malformed answer instead of inventing usage', () => {
    for (const bad of [
      null,
      { ...answer, ok: false },
      { ...answer, supporter: 'yes' },
      { ...answer, accountStatus: 'closed' },
      { ...answer, imports: { ...answer.imports, remaining: 4 } },
      { ...answer, imports: { ...answer.imports, remaining: null } },
      { ...answer, imports: { ...answer.imports, used: -1 } },
      { ...answer, imports: { ...answer.imports, resetsAt: 'tomorrow' } },
      { ...answer, refinements: {} },
      { ...answer, windowDays: 0 },
    ]) {
      expect(normalizeNotesImportAccountUsage(bad)).toBeNull()
    }
  })

  it('becomes the composer’s balance, with each import’s fresh refinements', () => {
    expect(
      accountUsageCredits(normalizeNotesImportAccountUsage(answer)!, { now })
    ).toEqual({
      remaining: 2,
      limit: 3,
      resetsAt: '2026-11-17T12:00:00.000Z',
      isSupporter: false,
      refinements: { remaining: 5, limit: 5 },
    })
  })

  it('shows a Supporter as unlimited', () => {
    const supporter = normalizeNotesImportAccountUsage({
      ...answer,
      supporter: true,
      imports: { limit: null, used: 0, remaining: null, resetsAt: null },
      refinements: { limitPerImport: null },
    })!
    expect(accountUsageCredits(supporter, { now })).toMatchObject({
      remaining: null,
      limit: null,
      isSupporter: true,
    })
  })

  it('isn’t a balance when the server couldn’t check Supporter status', () => {
    const unchecked = normalizeNotesImportAccountUsage({
      ...answer,
      supporterCheckFailed: true,
    })!
    expect(accountUsageCredits(unchecked, { now })).toBeNull()
  })

  it('frees a window that ended since the answer', () => {
    const usage = normalizeNotesImportAccountUsage(answer)!
    expect(
      accountUsageCredits(usage, {
        now: Date.parse('2026-11-17T12:00:00.000Z'),
      })
    ).toMatchObject({ remaining: 3, resetsAt: null })
  })
})
