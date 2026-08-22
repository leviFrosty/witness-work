import { describe, expect, it } from 'vitest'
import { notesImportUpdateRequired } from '@/features/notes-import/lib/notesImportVersionGate'

describe('notesImportUpdateRequired', () => {
  it('gates a build below the floor', () => {
    expect(notesImportUpdateRequired('1.41.1', '1.42.0')).toEqual({
      currentVersion: '1.41.1',
      minVersion: '1.42.0',
    })
  })

  it('allows a build at or above the floor', () => {
    expect(notesImportUpdateRequired('1.42.0', '1.42.0')).toBeNull()
    expect(notesImportUpdateRequired('1.42.1', '1.42.0')).toBeNull()
    expect(notesImportUpdateRequired('2.0.0', '1.42.0')).toBeNull()
  })

  it('compares numerically, not lexically', () => {
    expect(notesImportUpdateRequired('1.10.0', '1.9.0')).toBeNull()
    expect(notesImportUpdateRequired('1.9.0', '1.10.0')).not.toBeNull()
  })

  it('fails open when no floor is advertised', () => {
    expect(notesImportUpdateRequired('1.41.1', undefined)).toBeNull()
    expect(notesImportUpdateRequired('1.41.1', null)).toBeNull()
  })

  it('fails open when either version is unparseable', () => {
    expect(notesImportUpdateRequired(undefined, '1.42.0')).toBeNull()
    expect(notesImportUpdateRequired('dev', '1.42.0')).toBeNull()
    expect(notesImportUpdateRequired('1.41.1', 'latest')).toBeNull()
  })
})
