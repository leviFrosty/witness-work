import { expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() }, Platform: {} }))
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: { getString: () => undefined },
  PersistStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))

import { buddiesLossMessage } from './confirmAccountReplace'

const loss = (names: string[], inboxRegistered = true) => ({
  buddies: names.length,
  buddyNames: names,
  inboxRegistered,
})

it('names one buddy in the sentence', () => {
  expect(buddiesLossMessage(loss(['Ana Ruiz']))).toBe(
    "Your buddy Ana Ruiz will be removed from this phone, and you'll be removed from their app. Your Buddies data on this phone is deleted, and this can't be undone."
  )
})

it('lists several buddies, one per line', () => {
  expect(buddiesLossMessage(loss(['Ana Ruiz', 'Ben Cole']))).toBe(
    "Your 2 buddies on this phone will be removed, and you'll be removed from their apps:\n\n• Ana Ruiz\n• Ben Cole\n\nYour Buddies data on this phone is deleted, and this can't be undone."
  )
})

it('counts the buddies past the first five', () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  expect(buddiesLossMessage(loss(names))).toContain(
    '• A\n• B\n• C\n• D\n• E\nand 2 more\n\n'
  )
})

it('mentions only the Buddies data without buddies', () => {
  expect(buddiesLossMessage(loss([]))).toBe(
    "Your Buddies data on this phone is deleted, and this can't be undone."
  )
  expect(buddiesLossMessage(loss([], false))).toBeNull()
})
