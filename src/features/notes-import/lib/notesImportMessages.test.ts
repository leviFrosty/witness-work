import { describe, it, expect, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'ios' }))
vi.mock('react-native', () => ({ Platform: platform }))

// Mock i18n so the formatting/structure is asserted deterministically without
// loading the real locale bundle (which pulls in the RN runtime).
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, opts?: { count?: number }) =>
      opts?.count != null ? `${key}:${opts.count}` : key,
  },
}))

import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'
import {
  contactDetailLines,
  errorMessageKey,
  notesImportCountsLine,
  unavailableDetail,
  visitCountLabel,
} from '@/features/notes-import/lib/notesImportMessages'

const result = (
  over: Partial<Pick<NotesImportResult, 'contacts' | 'visits' | 'timeEntries'>>
): NotesImportResult =>
  ({
    contacts: [],
    visits: [],
    timeEntries: [],
    categories: [],
    publisher: null,
    warnings: [],
    summary: '',
    assistantMessage: '',
    ...over,
  }) as NotesImportResult

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${i}` }))

describe('errorMessageKey', () => {
  it('maps known codes to their keys', () => {
    expect(errorMessageKey('too_large')).toBe('notesImport_tooLarge')
    expect(errorMessageKey('model_error')).toBe('notesImport_modelError')
    expect(errorMessageKey('network')).toBe('notesImport_networkError')
    expect(errorMessageKey('attestation_failed')).toBe(
      'notesImport_attestationError'
    )
    expect(errorMessageKey('attestation_unavailable')).toBe(
      'notesImport_attestationUnavailable'
    )
    expect(errorMessageKey('refinement_limit')).toBe(
      'notesImport_refinementLimit'
    )
    expect(errorMessageKey('suspended')).toBe('notesImport_suspended')
    expect(errorMessageKey('upgrade_required')).toBe(
      'notesImport_updateRequired'
    )
    expect(errorMessageKey('not_found')).toBe('notesImport_error')
  })

  it('explains an unverifiable device in the account’s words, per platform', () => {
    platform.OS = 'ios'
    expect(errorMessageKey('device_ineligible')).toBe('account_unverifiedBody')
    platform.OS = 'android'
    expect(errorMessageKey('device_ineligible')).toBe(
      'account_unverifiedBodyAndroid'
    )
    platform.OS = 'ios'
  })

  it('falls back to the generic error key', () => {
    expect(errorMessageKey('limit_reached')).toBe('notesImport_error')
  })

  it('maps the unavailable code to the reusable unavailable key', () => {
    expect(errorMessageKey('unavailable')).toBe('notesImport_unavailable')
  })
})

describe('unavailableDetail', () => {
  it('returns operator-supplied free text', () => {
    expect(unavailableDetail('Down for maintenance until 5pm')).toBe(
      'Down for maintenance until 5pm'
    )
  })

  it('suppresses machine reason codes', () => {
    expect(unavailableDetail('disabled')).toBeUndefined()
    expect(unavailableDetail('no_provider')).toBeUndefined()
    expect(unavailableDetail('version_below_min')).toBeUndefined()
    expect(unavailableDetail('device_unverified')).toBeUndefined()
  })

  it('treats empty/whitespace/nullish reasons as no detail', () => {
    expect(unavailableDetail('')).toBeUndefined()
    expect(unavailableDetail('   ')).toBeUndefined()
    expect(unavailableDetail(null)).toBeUndefined()
    expect(unavailableDetail(undefined)).toBeUndefined()
  })

  it('trims surrounding whitespace from real detail', () => {
    expect(unavailableDetail('  Back at noon  ')).toBe('Back at noon')
  })
})

describe('notesImportCountsLine', () => {
  it('joins present groups with the dot separator, omitting zeros', () => {
    expect(
      notesImportCountsLine(
        result({ contacts: rows(3) as never, timeEntries: rows(2) as never })
      )
    ).toBe('notesImport_contactCount:3 · notesImport_timeEntryCount:2')
  })

  it('uses singular keys for a count of one', () => {
    expect(
      notesImportCountsLine(
        result({ contacts: rows(1) as never, timeEntries: rows(1) as never })
      )
    ).toBe('notesImport_contactCount:1 · notesImport_timeEntryCount:1')
  })

  it('returns an empty string when nothing was imported', () => {
    expect(notesImportCountsLine(result({}))).toBe('')
  })
})

describe('visitCountLabel', () => {
  it('passes the count to one plural key', () => {
    expect(visitCountLabel(1)).toBe('notesImport_visitCount:1')
    expect(visitCountLabel(2)).toBe('notesImport_visitCount:2')
  })
})

describe('contactDetailLines', () => {
  it('keeps phone and email left to right, and the rest as written', () => {
    expect(
      contactDetailLines({
        phone: '+1 415 555 0134',
        email: 'ada@example.com',
        addressLine: 'شارع النخيل 12',
        gender: 'female',
      })
    ).toEqual([
      {
        label: 'notesImport_detailPhone',
        value: '\u2066+1 415 555 0134\u2069',
      },
      {
        label: 'notesImport_detailEmail',
        value: '\u2066ada@example.com\u2069',
      },
      { label: 'notesImport_detailAddress', value: 'شارع النخيل 12' },
      { label: 'notesImport_detailGender', value: 'Female' },
    ])
  })

  it('lists only the fields the import has', () => {
    expect(contactDetailLines(undefined)).toEqual([])
    expect(contactDetailLines({ email: 'ada@example.com' })).toEqual([
      {
        label: 'notesImport_detailEmail',
        value: '\u2066ada@example.com\u2069',
      },
    ])
  })
})
