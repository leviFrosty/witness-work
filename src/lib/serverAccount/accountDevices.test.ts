import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  answers: [] as unknown[],
}))

vi.mock('@/constants/apis', () => ({
  default: { accounts: 'https://api.test' },
}))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: { request: mocks.request },
  isThisDeviceSession: (sessionId: string) => sessionId === OLD_ME,
}))

import { devicesTooOldForKeyChange, signedInElsewhere } from './accountDevices'

const ME = 'AAAAAAAAAAAAAAAAAAAAAA'
const OLD_ME = 'CCCCCCCCCCCCCCCCCCCCCC'
const OTHER = 'BBBBBBBBBBBBBBBBBBBBBB'
const KEY = new Uint8Array(32).fill(7)

const device = (sessionId: string, current: boolean, appVersion?: string) => ({
  sessionId,
  platform: 'ios',
  current,
  createdAt: 1,
  lastActiveAt: 2,
  expiresAt: 3,
  ...(appVersion !== undefined && { appVersion }),
})

beforeEach(() => {
  mocks.request.mockReset()
  mocks.request.mockImplementation(async () => ({
    data: { sessions: mocks.answers.shift() },
  }))
})

it('is true when another device has a live session', async () => {
  mocks.answers = [[device(ME, true), device(OTHER, false)]]
  await expect(signedInElsewhere(KEY)).resolves.toBe(true)
})

it("is false when every session is this install's", async () => {
  mocks.answers = [[device(ME, true), device(OLD_ME, false)]]
  await expect(signedInElsewhere(KEY)).resolves.toBe(false)
})

it("throws when the list can't be read", async () => {
  mocks.request.mockRejectedValue(new Error('offline'))
  await expect(signedInElsewhere(KEY)).rejects.toThrow('offline')
})

it('lists the other devices too old to rejoin after a key change', async () => {
  const OLDER = 'DDDDDDDDDDDDDDDDDDDDDD'
  const UNKNOWN = 'EEEEEEEEEEEEEEEEEEEEEE'
  mocks.answers = [
    [
      device(ME, true, '1.40.0'),
      device(OTHER, false, '1.47.0'),
      device(OLDER, false, '1.46.9'),
      device(UNKNOWN, false),
      device('FFFFFFFFFFFFFFFFFFFFFF', false, '2.0.0'),
    ],
  ]
  const old = await devicesTooOldForKeyChange(KEY)
  expect(old.map((entry) => [entry.sessionId, entry.appVersion])).toEqual([
    [OLDER, '1.46.9'],
    [UNKNOWN, null],
  ])
})
