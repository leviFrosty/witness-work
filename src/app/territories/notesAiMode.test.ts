import { describe, expect, it } from 'vitest'
import { notesAiMode } from '@/app/territories/notesAiMode'

describe('notesAiMode', () => {
  it.each([
    [
      false,
      { status: 'available', limited: false, resetsAt: null },
      'notOffered',
    ],
    [true, { status: 'hidden', reason: 'flag_off' }, 'off'],
    [true, { status: 'hidden', reason: 'disabled' }, 'unavailable'],
    [true, { status: 'hidden', reason: 'no_provider' }, 'unavailable'],
    [true, { status: 'offline' }, 'offline'],
    [true, { status: 'blocked', reason: 'suspended' }, 'unavailable'],
    [true, { status: 'available', limited: true, resetsAt: 1 }, 'limited'],
    [
      true,
      { status: 'available', limited: false, resetsAt: null },
      'available',
    ],
  ] as const)('offered %s, %o → %s', (offered, availability, mode) => {
    expect(notesAiMode(offered, availability)).toBe(mode)
  })
})
