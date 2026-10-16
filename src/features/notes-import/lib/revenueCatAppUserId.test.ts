import { beforeEach, describe, expect, it, vi } from 'vitest'

const account = vi.hoisted(() => ({
  id: (): string => 'install-uuid-1234',
}))
vi.mock('@/lib/account', () => ({
  getOrCreateAccountId: () => account.id(),
}))

import {
  notesImportRevenueCatAppUserId,
  toRevenueCatAppUserId,
} from '@/features/notes-import/lib/revenueCatAppUserId'

describe('toRevenueCatAppUserId', () => {
  it.each([
    '0f8fad5b-d9cb-469f-a165-70867728950e',
    'abcdefgh',
    'A_b-9'.padEnd(64, 'x'),
  ])('accepts %s', (id) => {
    expect(toRevenueCatAppUserId(id)).toBe(id)
  })

  it.each([
    ['a RevenueCat anonymous id', '$RCAnonymousID:0123456789abcdef'],
    ['seven characters', 'abcdefg'],
    ['65 characters', 'a'.repeat(65)],
    ['a space', 'abc defgh'],
    ['an email', 'someone@example.com'],
    ['nothing', ''],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, id) => {
    expect(toRevenueCatAppUserId(id)).toBeUndefined()
  })
})

describe('notesImportRevenueCatAppUserId', () => {
  beforeEach(() => {
    account.id = () => 'install-uuid-1234'
  })

  it('sends the id RevenueCat is logged in with', () => {
    expect(notesImportRevenueCatAppUserId()).toBe('install-uuid-1234')
  })

  it('leaves it out when it can’t be read', () => {
    account.id = () => {
      throw new Error('storage')
    }
    expect(notesImportRevenueCatAppUserId()).toBeUndefined()
  })
})
