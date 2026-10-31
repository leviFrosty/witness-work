import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  result: undefined as unknown,
  throws: false,
}))

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/toasts', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))
vi.mock('@/app/account/passkeyPrompt', () => ({ stopPasskeyPrompt: vi.fn() }))
vi.mock('@/app/account/passkeys', () => ({
  addPhonePasskey: vi.fn(async () => {
    if (fake.throws) throw new Error('boom')
    return fake.result
  }),
  letPhonePasskeyUnlock: vi.fn(),
  removePhonePasskey: vi.fn(),
}))
vi.mock('@/features/settings/components/account/passkeys/passkeyCopy', () => ({
  passkeyFailureMessage: () => 'failed',
  signInOnlyMessage: () => 'sign in only',
}))
vi.mock('@/lib/serverAccount/passkeyFlow', () => ({
  isLastUnlocking: () => false,
}))

import { stopPasskeyPrompt } from '@/app/account/passkeyPrompt'
import { addPasskeyWithToasts } from '@/features/settings/components/account/passkeys/passkeyActions'

const context = { count: 0, support: null, source: 'settings' } as const

beforeEach(() => {
  vi.clearAllMocks()
  fake.throws = false
})

describe('addPasskeyWithToasts', () => {
  it.each([
    ['one that can unlock', { status: 'added', canUnlock: true }],
    [
      'one for signing in only',
      { status: 'added', canUnlock: false, signInOnly: 'no_prf' },
    ],
  ])(
    'stops the gentle prompt for good for %s, wherever it was added',
    async (_name, result) => {
      fake.result = result
      await expect(addPasskeyWithToasts(context)).resolves.toBe(true)
      expect(stopPasskeyPrompt).toHaveBeenCalledTimes(1)
    }
  )

  it.each([
    ['cancelled', { status: 'cancelled', step: 'create' }],
    ['failed', { status: 'failed', step: 'save', reason: 'network' }],
  ])('leaves the prompt alone when the add %s', async (_name, result) => {
    fake.result = result
    await expect(addPasskeyWithToasts(context)).resolves.toBe(false)
    expect(stopPasskeyPrompt).not.toHaveBeenCalled()
  })

  it('leaves the prompt alone when the add throws', async () => {
    fake.throws = true
    await expect(addPasskeyWithToasts(context)).resolves.toBe(false)
    expect(stopPasskeyPrompt).not.toHaveBeenCalled()
  })
})
