import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  os: 'ios',
  supported: true,
  session: { accountId: 'a' } as object | null,
  key: new Uint8Array(32) as Uint8Array | null,
  passkeys: [] as object[],
  listError: null as Error | null,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/app/account/accountKey', () => ({
  accountKey: { peek: async () => runtime.key },
}))
vi.mock('@/app/account/passkeys', () => ({
  phonePasskeySupport: async () => ({
    passkeys: runtime.supported,
    prf: 'no',
  }),
  loadPasskeys: vi.fn(async () => {
    if (runtime.listError) throw runtime.listError
    return { passkeys: runtime.passkeys }
  }),
}))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    ready: async () => undefined,
    snapshot: () => runtime.session,
  },
}))

import { readPasskeyOffer } from '@/app/account/passkeyOffer'
import { loadPasskeys } from '@/app/account/passkeys'

beforeEach(() => {
  vi.clearAllMocks()
  runtime.os = 'ios'
  runtime.supported = true
  runtime.session = { accountId: 'a' }
  runtime.key = new Uint8Array(32)
  runtime.passkeys = []
  runtime.listError = null
})

describe('readPasskeyOffer', () => {
  it('offers one to a phone account with none', async () => {
    expect(await readPasskeyOffer()).toBe('offer')
  })

  it('never offers on the web, and asks no one', async () => {
    runtime.os = 'web'
    expect(await readPasskeyOffer()).toBe('unavailable')
    expect(loadPasskeys).not.toHaveBeenCalled()
  })

  it('never offers where passkeys are unsupported', async () => {
    runtime.supported = false
    expect(await readPasskeyOffer()).toBe('unavailable')
    expect(loadPasskeys).not.toHaveBeenCalled()
  })

  it.each([
    ['has no session', { session: null }],
    ['has no account key', { key: null }],
  ])(
    'offers nothing, and reads nothing, while the device %s',
    async (_n, o) => {
      Object.assign(runtime, o)
      expect(await readPasskeyOffer()).toBe('unavailable')
      expect(loadPasskeys).not.toHaveBeenCalled()
    }
  )

  it('says the account has one, so the prompt can stop for good', async () => {
    runtime.passkeys = [{}]
    expect(await readPasskeyOffer()).toBe('has_passkey')
  })

  it('offers nothing when the account can’t be read', async () => {
    runtime.listError = new Error('offline')
    expect(await readPasskeyOffer()).toBe('unavailable')
  })
})
