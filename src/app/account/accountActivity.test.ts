import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  answers: [] as unknown[],
}))

vi.mock('@/constants/apis', () => ({
  default: { accounts: 'https://api.test' },
}))
vi.mock('@/app/account/accountKey', () => ({
  accountKey: { peek: async () => new Uint8Array(32).fill(7) },
}))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: { request: mocks.request },
  isThisDeviceSession: (sessionId: string) => sessionId === 'me',
  serverAccount: { cached: () => null },
  keyHistoryCache: { read: async () => null },
}))
vi.mock('@/lib/serverAccount/activityLabels', () => ({
  createDeviceLabelReader: () => () => null,
}))

import { loadAccountDevices } from './accountActivity'

const device = (sessionId: string, current: boolean) => ({
  sessionId,
  platform: 'ios',
  current,
  createdAt: 1,
  lastActiveAt: 2,
  expiresAt: 3,
})
const ME = 'AAAAAAAAAAAAAAAAAAAAAA'
const OTHER = 'BBBBBBBBBBBBBBBBBBBBBB'

beforeEach(() => {
  mocks.request.mockReset()
  mocks.request.mockImplementation(async () => ({
    data: { sessions: mocks.answers.shift() },
  }))
})

it('lists once when this device is in the list', async () => {
  mocks.answers = [[device(ME, true), device(OTHER, false)]]
  const { devices } = await loadAccountDevices()
  expect(devices.map((d) => d.current)).toEqual([true, false])
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.request.mock.calls[0][1]).toMatchObject({ renew: false })
})

it('renews the token and lists again when this device is missing', async () => {
  mocks.answers = [
    [device(OTHER, false)],
    [device(ME, true), device(OTHER, false)],
  ]
  const { devices, context } = await loadAccountDevices()
  expect(devices.map((d) => d.current)).toEqual([true, false])
  expect(mocks.request.mock.calls.map((call) => call[1].renew)).toEqual([
    false,
    true,
  ])
  expect(context.isThisDevice('me')).toBe(true)
})

it('shows the list as it is when renewing doesn’t add this device', async () => {
  mocks.answers = [[device(OTHER, false)], [device(OTHER, false)]]
  const { devices } = await loadAccountDevices()
  expect(devices).toHaveLength(1)
  expect(mocks.request).toHaveBeenCalledTimes(2)
})
