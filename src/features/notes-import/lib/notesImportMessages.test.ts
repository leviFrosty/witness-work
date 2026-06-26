import { describe, it, expect, vi } from 'vitest'

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
    expect(errorMessageKey('attestation_required')).toBe(
      'notesImport_attestationError'
    )
    expect(errorMessageKey('refinement_limit')).toBe(
      'notesImport_refinementLimit'
    )
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

  it('returns an empty string when nothing was imported', () => {
    expect(notesImportCountsLine(result({}))).toBe('')
  })
})

describe('visitCountLabel', () => {
  it('uses the singular key for one and plural otherwise', () => {
    expect(visitCountLabel(1)).toBe('notesImport_visitCount:1')
    expect(visitCountLabel(2)).toBe('notesImport_visitCount_plural:2')
  })
})
