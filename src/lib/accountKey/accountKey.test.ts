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

function setup({
  key = null as Uint8Array | null,
  loss = NO_LOSS as Omit<AccountKeyLoss, 'keptElsewhere'>,
  accountId = 'account-id' as string | null,

  elsewhere = false as boolean | Error,
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

    changeKey: vi.fn(
      async (
        swap: () => Promise<void>,
        _keys: { from: Uint8Array | null; to: Uint8Array }
      ) => {
        log.push('account.close')
        await swap()
        log.push('account.unblock')
      }
    ),
    signedInElsewhere: vi.fn(async () => {
      if (elsewhere instanceof Error) throw elsewhere
      return elsewhere
    }),
  }
  const buddies = {
    loss: vi.fn(() => buddiesLoss),
    release: vi.fn(async (scope: 'device' | 'account') => {
      log.push(`buddies.release:${scope}`)

      if (scope === 'account') stored = null
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
      loss: {
        buddies: 3,
        buddyNames: ['Ana', 'Ben', 'Cy'],
        inboxRegistered: true,
      },
    })
    expect(await service.replace(new Uint8Array(key))).toEqual({
      outcome: 'unchanged',
    })
    expect(store.replace).not.toHaveBeenCalled()
    expect(buddies.release).not.toHaveBeenCalled()
    expect(account.changeKey).not.toHaveBeenCalled()
    expect(await service.lossIfReplaced(key)).toEqual(NO_LOSS)
  })

  it('replaces a key with nothing derived from it, and registers the account', async () => {
    const key = random()
    const newKey = random()
    const { service, log, stored, buddies, account } = setup({ key })
    expect(await service.replace(newKey)).toEqual({
      outcome: 'replaced',
      loss: NO_LOSS,
      accountId: 'account-id',
    })
    expect(stored()).toBe(toB64u(newKey))
    expect(buddies.release).not.toHaveBeenCalled()

    expect(log).toEqual([
      'account.close',
      'store.replace',
      'buddies.forget',
      'account.unblock',
      `account.ensure:${toB64u(newKey)}`,
    ])
    expect(account.changeKey).toHaveBeenCalledWith(expect.any(Function), {
      from: key,
      to: newKey,
    })
  })

  it('stores a key on a device that had none, without asking', async () => {
    const newKey = random()
    const { service, stored, buddies } = setup({
      loss: { buddies: 2, buddyNames: ['Ana', 'Ben'], inboxRegistered: true },
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
    const loss = {
      buddies: 2,
      buddyNames: ['Ana', 'Ben'],
      inboxRegistered: true,
    }
    const { service, stored, store, buddies, account } = setup({ key, loss })
    const shown = { ...loss, keptElsewhere: false }
    expect(await service.lossIfReplaced(random())).toEqual(shown)
    const error = await service.replace(random()).catch((e) => e)
    expect(error).toBeInstanceOf(AccountKeyLossError)
    expect((error as AccountKeyLossError).loss).toEqual(shown)
    expect(stored()).toBe(toB64u(key))
    expect(store.replace).not.toHaveBeenCalled()
    expect(buddies.release).not.toHaveBeenCalled()
    expect(account.changeKey).not.toHaveBeenCalled()
  })

  it('runs Delete Buddies first when confirmed, even for an inbox alone', async () => {
    const newKey = random()
    const loss = { buddies: 0, buddyNames: [], inboxRegistered: true }
    const { service, log, stored } = setup({ key: random(), loss })
    expect(await service.replace(newKey, { confirmedLoss: true })).toEqual({
      outcome: 'replaced',
      loss: { ...loss, keptElsewhere: false },
      accountId: 'account-id',
    })
    expect(stored()).toBe(toB64u(newKey))
    expect(log).toEqual([
      'buddies.release:account',
      'account.close',
      'store.replace',
      'buddies.forget',
      'account.unblock',
      `account.ensure:${toB64u(newKey)}`,
    ])
  })

  it('only signs this device out of Buddies while the account has other devices', async () => {
    const newKey = random()
    const loss = { buddies: 1, buddyNames: ['Ana'], inboxRegistered: true }
    const { service, log, stored } = setup({
      key: random(),
      loss,
      elsewhere: true,
    })
    const kept = { ...loss, keptElsewhere: true }
    expect(await service.lossIfReplaced(newKey)).toEqual(kept)
    expect(await service.replace(newKey, { confirmedLoss: true })).toEqual({
      outcome: 'replaced',
      loss: kept,
      accountId: 'account-id',
    })
    expect(stored()).toBe(toB64u(newKey))
    expect(log[0]).toBe('buddies.release:device')
  })

  it('changes nothing while the account’s other devices can’t be checked', async () => {
    const key = random()
    const { service, buddies, store, stored } = setup({
      key,
      loss: { buddies: 1, buddyNames: ['Ana'], inboxRegistered: true },
      elsewhere: new Error('offline'),
    })
    await expect(service.lossIfReplaced(random())).rejects.toThrow('offline')
    await expect(
      service.replace(random(), { confirmedLoss: true })
    ).rejects.toThrow('offline')
    expect(buddies.release).not.toHaveBeenCalled()
    expect(store.replace).not.toHaveBeenCalled()
    expect(stored()).toBe(toB64u(key))
  })

  it('checks the other devices again before deleting anything', async () => {
    const { service, account, log } = setup({
      key: random(),
      loss: { buddies: 1, buddyNames: ['Ana'], inboxRegistered: true },
    })
    expect(await service.lossIfReplaced(random())).toMatchObject({
      keptElsewhere: false,
    })

    account.signedInElsewhere.mockResolvedValueOnce(true)
    await service.replace(random(), { confirmedLoss: true })
    expect(log[0]).toBe('buddies.release:device')
  })

  it('doesn’t ask about other devices when nothing would be lost', async () => {
    const { service, account } = setup({ key: random() })
    expect(await service.lossIfReplaced(random())).toEqual(NO_LOSS)
    await service.replace(random())
    expect(account.signedInElsewhere).not.toHaveBeenCalled()
  })

  it('keeps the old key when Delete Buddies fails', async () => {
    const key = random()
    const { service, buddies, store, stored } = setup({
      key,
      loss: { buddies: 1, buddyNames: ['Ana'], inboxRegistered: true },
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

  it('keeps a session already opened for the new key', async () => {
    const newKey = random()
    const { service, log } = setup({ key: random() })
    const session = {
      adopt: vi.fn(async () => {
        log.push('session.adopt')
      }),
    }
    await service.replace(newKey, { session })

    expect(log).toEqual([
      'account.close',
      'store.replace',
      'buddies.forget',
      'session.adopt',
      'account.unblock',
      `account.ensure:${toB64u(newKey)}`,
    ])
  })

  it('surfaces a failed native write, keeping the old key', async () => {
    const key = random()
    const { service, store, account, buddies, log, stored } = setup({ key })
    store.replace.mockRejectedValueOnce(new Error('keychain'))
    const session = { adopt: vi.fn(async () => undefined) }
    await expect(service.replace(random(), { session })).rejects.toThrow(
      'keychain'
    )

    expect(log).toEqual(['account.close'])
    expect(stored()).toBe(toB64u(key))
    expect(buddies.forget).not.toHaveBeenCalled()
    expect(session.adopt).not.toHaveBeenCalled()
    expect(account.ensure).not.toHaveBeenCalled()
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
    expect(log).toEqual(['account.close', 'store.replace:slow'])
    release()
    await Promise.all([first, second])
    expect(log.filter((entry) => entry.startsWith('store.replace'))).toEqual([
      'store.replace:slow',
      'store.replace',
    ])
  })
})
