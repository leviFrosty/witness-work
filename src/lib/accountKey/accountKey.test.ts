import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  AccountKeyLossError,
  type AccountKeyLoss,
  createAccountKeyService,
  NO_LOSS,
} from '@/lib/accountKey/accountKey'

const random = () => new Uint8Array(randomBytes(32))

/** The native store, the server account, and Buddies, all in memory. */
function setup({
  key = null as Uint8Array | null,
  loss = NO_LOSS as AccountKeyLoss,
  accountId = 'account-id' as string | null,
} = {}) {
  const log: string[] = []
  let stored = key ? toB64u(key) : null
  let buddiesLoss = loss
  const store = {
    peek: vi.fn(async () => stored),
    getOrCreate: vi.fn(async () => {
      stored ??= toB64u(random())
      return stored
    }),
    replace: vi.fn(async (next: string) => {
      log.push('store.replace')
      stored = next
    }),
  }
  const account = {
    ensure: vi.fn(async (accountKey: Uint8Array) => {
      log.push(`account.ensure:${toB64u(accountKey)}`)
      return accountId ? { accountId } : null
    }),
    forget: vi.fn(() => {
      log.push('account.forget')
    }),
  }
  const buddies = {
    loss: vi.fn(() => buddiesLoss),
    release: vi.fn(async () => {
      log.push('buddies.release')
      // Delete Buddies deletes the seed, and resets Buddies.
      stored = null
      buddiesLoss = NO_LOSS
    }),
    forget: vi.fn(() => {
      log.push('buddies.forget')
    }),
  }
  const service = createAccountKeyService({ store, account, buddies })
  return { service, store, account, buddies, log, stored: () => stored }
}

describe('account key service', () => {
  it('peeks without creating, and creates on getOrCreate', async () => {
    const { service, stored } = setup()
    expect(await service.peek()).toBeNull()
    const created = await service.getOrCreate()
    expect(created).toHaveLength(32)
    expect(stored()).toBe(toB64u(created))
    expect(await service.peek()).toEqual(created)
    expect(await service.getOrCreate()).toEqual(created)
  })

  it('does nothing when the key is the same', async () => {
    const key = random()
    const { service, store, account, buddies } = setup({
      key,
      loss: { buddies: 3, inboxRegistered: true },
    })
    expect(await service.replace(new Uint8Array(key))).toEqual({
      outcome: 'unchanged',
    })
    expect(store.replace).not.toHaveBeenCalled()
    expect(buddies.release).not.toHaveBeenCalled()
    expect(account.forget).not.toHaveBeenCalled()
    expect(await service.lossIfReplaced(key)).toEqual(NO_LOSS)
  })

  it('replaces a key with nothing derived from it, and registers the account', async () => {
    const newKey = random()
    const { service, log, stored, buddies } = setup({ key: random() })
    expect(await service.replace(newKey)).toEqual({
      outcome: 'replaced',
      loss: NO_LOSS,
      accountId: 'account-id',
    })
    expect(stored()).toBe(toB64u(newKey))
    expect(buddies.release).not.toHaveBeenCalled()
    expect(log).toEqual([
      'store.replace',
      'account.forget',
      'buddies.forget',
      `account.ensure:${toB64u(newKey)}`,
    ])
  })

  it('stores a key on a device that had none, without asking', async () => {
    const newKey = random()
    const { service, stored, buddies } = setup({
      loss: { buddies: 2, inboxRegistered: true },
    })
    expect(await service.lossIfReplaced(newKey)).toEqual(NO_LOSS)
    await expect(service.replace(newKey)).resolves.toMatchObject({
      outcome: 'replaced',
    })
    expect(stored()).toBe(toB64u(newKey))
    expect(buddies.release).not.toHaveBeenCalled()
  })

  it('refuses to lose Buddies data unconfirmed, changing nothing', async () => {
    const key = random()
    const loss = { buddies: 2, inboxRegistered: true }
    const { service, stored, store, buddies, account } = setup({ key, loss })
    expect(await service.lossIfReplaced(random())).toEqual(loss)
    const error = await service.replace(random()).catch((e) => e)
    expect(error).toBeInstanceOf(AccountKeyLossError)
    expect((error as AccountKeyLossError).loss).toEqual(loss)
    expect(stored()).toBe(toB64u(key))
    expect(store.replace).not.toHaveBeenCalled()
    expect(buddies.release).not.toHaveBeenCalled()
    expect(account.forget).not.toHaveBeenCalled()
  })

  it('runs Delete Buddies first when confirmed, even for an inbox alone', async () => {
    const newKey = random()
    const loss = { buddies: 0, inboxRegistered: true }
    const { service, log, stored } = setup({ key: random(), loss })
    expect(await service.replace(newKey, { confirmedLoss: true })).toEqual({
      outcome: 'replaced',
      loss,
      accountId: 'account-id',
    })
    expect(stored()).toBe(toB64u(newKey))
    expect(log).toEqual([
      'buddies.release',
      'store.replace',
      'account.forget',
      'buddies.forget',
      `account.ensure:${toB64u(newKey)}`,
    ])
  })

  it('keeps the old key when Delete Buddies fails', async () => {
    const key = random()
    const { service, buddies, store, stored } = setup({
      key,
      loss: { buddies: 1, inboxRegistered: true },
    })
    buddies.release.mockRejectedValueOnce(new Error('offline'))
    await expect(
      service.replace(random(), { confirmedLoss: true })
    ).rejects.toThrow('offline')
    expect(store.replace).not.toHaveBeenCalled()
    expect(stored()).toBe(toB64u(key))
  })

  it('stays replaced when the account can’t be registered yet', async () => {
    const { service, account } = setup({ key: random(), accountId: null })
    await expect(service.replace(random())).resolves.toMatchObject({
      outcome: 'replaced',
      accountId: null,
    })
    account.ensure.mockRejectedValueOnce(new Error('boom'))
    await expect(service.replace(random())).resolves.toMatchObject({
      outcome: 'replaced',
      accountId: null,
    })
  })

  it('surfaces a failed native write without forgetting the account', async () => {
    const { service, store, account } = setup({ key: random() })
    store.replace.mockRejectedValueOnce(new Error('keychain'))
    await expect(service.replace(random())).rejects.toThrow('keychain')
    expect(account.forget).not.toHaveBeenCalled()
  })

  it('refuses a key that isn’t 32 bytes', async () => {
    const { service, store } = setup({ key: random() })
    await expect(service.replace(new Uint8Array(16))).rejects.toThrow()
    expect(store.replace).not.toHaveBeenCalled()
  })

  it('runs replacements one at a time', async () => {
    const { service, store, log } = setup({ key: random() })
    let release!: () => void
    store.replace.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          log.push('store.replace:slow')
          release = resolve
        })
    )
    const first = service.replace(random())
    const second = service.replace(random())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(log).toEqual(['store.replace:slow'])
    release()
    await Promise.all([first, second])
    expect(log.filter((entry) => entry.startsWith('store.replace'))).toEqual([
      'store.replace:slow',
      'store.replace',
    ])
  })
})
