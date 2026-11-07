import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('__DEV__', false)

type SyncFile = { filename: string; json: string; modifiedAt: number }

const runtime = vi.hoisted(() => ({
  files: [] as SyncFile[],
  pending: [] as string[],
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    private values = new Map<string, string | number>()
    getString(key: string) {
      const value = this.values.get(key)
      return typeof value === 'string' ? value : undefined
    }
    getNumber(key: string) {
      const value = this.values.get(key)
      return typeof value === 'number' ? value : undefined
    }
    set(key: string, value: string | number) {
      this.values.set(key, value)
    }
    delete(key: string) {
      this.values.delete(key)
    }
  },
}))
vi.mock('expo-device', () => ({ modelName: 'iPad' }))
vi.mock('@/lib/installId', () => ({ getOrCreateInstallId: () => 'ipad' }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('../../modules/icloud-bridge', () => ({
  readFiles: vi.fn(async (include: (filename: string) => boolean) => ({
    files: runtime.files.filter((f) => include(f.filename)),
    pending: runtime.pending.filter(include),
  })),
  write: vi.fn(async () => 1),
  deleteFile: vi.fn(async () => {}),
}))

const claim = (filename: string, accountId: string, updatedAt: number) => ({
  filename,
  modifiedAt: updatedAt,
  json: JSON.stringify({ v: 1, accountId, entitled: true, updatedAt }),
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.files = []
  runtime.pending = []
})

describe('readAccountFile', () => {
  it('canonicalizes a winning conflict duplicate', async () => {
    runtime.files = [claim('witness-work-account 2.json', 'phone', 2)]
    const { readAccountFile } = await import('./account')
    const bridge = await import('../../modules/icloud-bridge')

    expect(await readAccountFile()).toMatchObject({ pending: false })
    expect(bridge.write).toHaveBeenCalledWith(
      'witness-work-account.json',
      expect.stringContaining('"accountId":"phone"')
    )
  })

  it('leaves the files alone while one is still downloading', async () => {
    runtime.files = [claim('witness-work-account 2.json', 'phone', 2)]
    runtime.pending = ['witness-work-account.json']
    const { readAccountFile } = await import('./account')
    const bridge = await import('../../modules/icloud-bridge')

    expect(await readAccountFile()).toMatchObject({
      file: { accountId: 'phone' },
      pending: true,
    })
    expect(bridge.write).not.toHaveBeenCalled()
    expect(bridge.deleteFile).not.toHaveBeenCalled()
  })
})

describe('an adopted id belongs to its server account', () => {
  const ACCT_A = 'a'.repeat(64)
  const ACCT_B = 'b'.repeat(64)

  it("is this device's id on the account it was adopted for", async () => {
    const account = await import('./account')
    account.bindSupporterAccount(ACCT_A)
    account.adoptAccountId('phone', 1, ACCT_A)
    expect(account.getOrCreateAccountId()).toBe('phone')
  })

  it('is dropped once another account is bound', async () => {
    const account = await import('./account')
    account.bindSupporterAccount(ACCT_A)
    account.adoptAccountId('phone', 1, ACCT_A)
    expect(account.getOrCreateAccountId()).toBe('phone')

    account.bindSupporterAccount(ACCT_B)
    expect(account.getOrCreateAccountId()).toBe('ipad')

    account.bindSupporterAccount(ACCT_A)
    expect(account.getOrCreateAccountId()).toBe('ipad')
    expect(account.getOwnAccountClaim(false).claimedAt).not.toBe(1)
  })

  it('is kept while no account is bound, until one is', async () => {
    const account = await import('./account')
    account.adoptAccountId('phone', 1, ACCT_A)
    expect(account.getOrCreateAccountId()).toBe('phone')
    account.bindSupporterAccount(ACCT_B)
    expect(account.getOrCreateAccountId()).toBe('ipad')
  })

  it("keeps an id that doesn't say whose it is", async () => {
    const account = await import('./account')
    account.bindSupporterAccount(ACCT_B)
    account.adoptAccountId('phone', 1, null)
    expect(account.getOrCreateAccountId()).toBe('phone')
  })

  describe('an id dropped for another account is remembered', () => {
    it('with the account it was adopted for', async () => {
      const account = await import('./account')
      account.bindSupporterAccount(ACCT_A)
      account.adoptAccountId('phone', 1, ACCT_A)
      account.dropAdoptedAccountId(ACCT_A)
      expect(account.getOrCreateAccountId()).toBe('ipad')
      expect(account.droppedAccountIds()).toEqual([
        { appUserId: 'phone', account: ACCT_A },
      ])
    })

    it("with the previous account when the id didn't say", async () => {
      const account = await import('./account')
      account.bindSupporterAccount(ACCT_A)
      account.adoptAccountId('phone', 1, null)
      account.dropAdoptedAccountId(ACCT_A)
      expect(account.droppedAccountIds()).toEqual([
        { appUserId: 'phone', account: ACCT_A },
      ])
    })

    it('when another account bound drops it', async () => {
      const account = await import('./account')
      account.bindSupporterAccount(ACCT_A)
      account.adoptAccountId('phone', 1, ACCT_A)
      account.bindSupporterAccount(ACCT_B)
      expect(account.getOrCreateAccountId()).toBe('ipad')
      expect(account.droppedAccountIds()).toEqual([
        { appUserId: 'phone', account: ACCT_A },
      ])
    })

    it('nothing, without an adopted id', async () => {
      const account = await import('./account')
      account.dropAdoptedAccountId(ACCT_A)
      expect(account.droppedAccountIds()).toEqual([])
    })

    it('a few at most, the latest first', async () => {
      const account = await import('./account')
      for (let i = 0; i < 6; i++) {
        account.adoptAccountId(`phone-${i}`, 1, ACCT_A)
        account.dropAdoptedAccountId(ACCT_A)
      }

      account.adoptAccountId('phone-3', 1, ACCT_B)
      account.dropAdoptedAccountId(ACCT_B)
      expect(account.droppedAccountIds()).toEqual([
        { appUserId: 'phone-3', account: ACCT_B },
        { appUserId: 'phone-5', account: ACCT_A },
        { appUserId: 'phone-4', account: ACCT_A },
        { appUserId: 'phone-2', account: ACCT_A },
      ])
    })
  })

  it('says when the id may have changed', async () => {
    const account = await import('./account')
    const listener = vi.fn()
    account.onAccountIdChange(listener)
    account.adoptAccountId('phone', 1, ACCT_A)
    account.bindSupporterAccount(ACCT_B)
    account.clearAdoptedAccountId()
    expect(listener).toHaveBeenCalledTimes(3)
  })
})

describe('an id adopted from an untagged claim', () => {
  const ACCT_A = 'a'.repeat(64)
  const ACCT_B = 'b'.repeat(64)

  it("makes an untagged claim, though it's kept on this account", async () => {
    const account = await import('./account')
    account.bindSupporterAccount(ACCT_B)
    account.adoptAccountId('phone', 1, ACCT_B, { tagged: false })
    expect(account.getOrCreateAccountId()).toBe('phone')
    const own = account.getOwnAccountClaim(false, ACCT_B)
    expect(own).toMatchObject({ appUserId: 'phone' })
    expect(own.account).toBeUndefined()
  })

  it('makes a tagged claim again once a tagged one is adopted', async () => {
    const account = await import('./account')
    account.bindSupporterAccount(ACCT_B)
    account.adoptAccountId('phone', 1, ACCT_B, { tagged: false })
    account.adoptAccountId('tablet', 1, ACCT_B)
    expect(account.getOwnAccountClaim(false, ACCT_B)).toMatchObject({
      appUserId: 'tablet',
      account: ACCT_B,
    })
  })

  it("doesn't make the install id's claim untagged", async () => {
    const account = await import('./account')
    account.bindSupporterAccount(ACCT_B)
    account.adoptAccountId('phone', 1, ACCT_B, { tagged: false })
    account.clearAdoptedAccountId()
    expect(account.getOwnAccountClaim(false, ACCT_B)).toMatchObject({
      appUserId: 'ipad',
      account: ACCT_B,
    })
  })

  it('stays untagged when the first account bound stamps it', async () => {
    const account = await import('./account')
    account.adoptAccountId('phone', 1, null, { tagged: false })
    account.bindSupporterAccount(ACCT_A)
    expect(account.getOwnAccountClaim(false, ACCT_A).account).toBeUndefined()
  })
})

describe("the released app's adoption (no account recorded)", () => {
  const ACCT_A = 'a'.repeat(64)
  const ACCT_B = 'b'.repeat(64)

  it("becomes the first bound account's, so another one drops it", async () => {
    const account = await import('./account')
    account.adoptAccountId('phone', 1, null)
    account.bindSupporterAccount(ACCT_A)
    expect(account.adoptedAccountIdFor()).toBe(ACCT_A)
    expect(account.getOrCreateAccountId()).toBe('phone')

    expect(account.getOwnAccountClaim(false, ACCT_A)).toMatchObject({
      appUserId: 'phone',
      account: ACCT_A,
    })

    account.bindSupporterAccount(ACCT_B)
    expect(account.getOrCreateAccountId()).toBe('ipad')
    expect(account.droppedAccountIds()).toEqual([
      { appUserId: 'phone', account: ACCT_A },
    ])
  })

  it("isn't stamped by a bind that switches accounts", async () => {
    const account = await import('./account')
    account.bindSupporterAccount(ACCT_A)
    account.adoptAccountId('phone', 1, null)
    account.bindSupporterAccount(ACCT_B)
    expect(account.adoptedAccountIdFor()).toBeNull()
  })
})

describe('the claim carries its server account', () => {
  it("is the adopted id's account while this device has none", async () => {
    const account = await import('./account')
    account.adoptAccountId('phone', 1, 'a'.repeat(64))
    expect(account.getOwnAccountClaim(true, null)).toMatchObject({
      appUserId: 'phone',
      account: 'a'.repeat(64),
    })
  })

  it("is this device's account once it has one", async () => {
    const account = await import('./account')
    account.adoptAccountId('phone', 1, null)
    expect(account.getOwnAccountClaim(true, 'b'.repeat(64))).toMatchObject({
      account: 'b'.repeat(64),
    })
  })

  it('writes the account into the file', async () => {
    const account = await import('./account')
    const bridge = await import('../../modules/icloud-bridge')
    await account.writeAccountFile(
      account.getOwnAccountClaim(true, 'a'.repeat(64))
    )
    expect(bridge.write).toHaveBeenCalledWith(
      'witness-work-account.json',
      expect.stringContaining(`"account":"${'a'.repeat(64)}"`)
    )
  })
})
