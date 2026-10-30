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
  loss = NO_LOSS as Omit<AccountKeyLoss, 'keptElsewhere'>,
  accountId = 'account-id' as string | null,
  /** Another device signed in to the account, or the error reading it. */
  elsewhere = false as boolean | Error,
  /** The account this device was last on. */
  lastAccountId = null as string | null,
  /** A key the server knows as `lastAccountId`'s current key. */
  sameAccountKey = null as string | null,
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
    // Ends the old key's session; none opens until the swap is done.
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
    lastAccountId: () => lastAccountId,
    openDetached: vi.fn(
      async (accountKey: Uint8Array, call: { accountId: string }) => {
        log.push(`account.openDetached:${call.accountId}`)
        if (toB64u(accountKey) !== sameAccountKey)
          throw Object.assign(new Error('unknown_account'), {
            serverCode: 'unknown_account',
          })
        return {
          accountId: call.accountId,
          adopt: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
        }
      }
    ),
    rekeyed: vi.fn(
      async (
        _from: Uint8Array,
        _to: Uint8Array,
        _call: { accountId: string; tokens?: unknown }
      ) => {
        log.push('account.rekeyed')
      }
    ),
  }
  const buddies = {
    loss: vi.fn(() => buddiesLoss),
    release: vi.fn(async (scope: 'device' | 'account') => {
      log.push(`buddies.release:${scope}`)
      // Delete Buddies deletes the seed; either way Buddies resets.
      if (scope === 'account') stored = null
      buddiesLoss = NO_LOSS
    }),
    forget: vi.fn(() => {
      log.push('buddies.forget')
    }),
  }
  const sync = { leave: vi.fn(async () => undefined) }
  const service = createAccountKeyService({ store, account, buddies, sync })
  return { service, store, account, buddies, sync, log, stored: () => stored }
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
      sameAccount: false,
    })
    expect(stored()).toBe(toB64u(newKey))
    expect(buddies.release).not.toHaveBeenCalled()
    // The old key's session ends before the new key is stored.
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
      sameAccount: false,
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
      sameAccount: false,
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
    // Another device signed in after the warning was shown.
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
    // Adopted before any other session can open.
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
    // The old session ended first; the old key's next call opens another.
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

describe('account key service, same account', () => {
  const ACCOUNT = 'A'.repeat(22)
  const loss = {
    buddies: 2,
    buddyNames: ['Ana', 'Ben'],
    inboxRegistered: true,
  }

  it('rejoins the account it was on without asking, leaving or releasing anything', async () => {
    const oldKey = random()
    const newKey = random()
    const { service, buddies, sync, account, log, stored } = setup({
      key: oldKey,
      loss,
      accountId: ACCOUNT,
      lastAccountId: ACCOUNT,
    })
    expect(
      await service.lossIfReplaced(newKey, { accountId: ACCOUNT })
    ).toEqual(NO_LOSS)
    const result = await service.replace(newKey, { accountId: ACCOUNT })
    expect(result).toEqual({
      outcome: 'replaced',
      loss: NO_LOSS,
      accountId: ACCOUNT,
      sameAccount: true,
    })
    expect(buddies.release).not.toHaveBeenCalled()
    expect(sync.leave).not.toHaveBeenCalled()
    expect(account.signedInElsewhere).not.toHaveBeenCalled()
    expect(stored()).toBe(toB64u(newKey))
    expect(log).toEqual([
      'account.close',
      'store.replace',
      'buddies.forget',
      'account.unblock',
      `account.ensure:${toB64u(newKey)}`,
    ])
    expect(account.ensure).toHaveBeenCalledWith(newKey, { accountId: ACCOUNT })
  })

  it('treats another account as another account', async () => {
    const { service, sync } = setup({
      key: random(),
      loss,
      lastAccountId: ACCOUNT,
    })
    await expect(
      service.replace(random(), { accountId: 'B'.repeat(22) })
    ).rejects.toBeInstanceOf(AccountKeyLossError)
    expect(
      (await service.lossIfReplaced(random(), { accountId: 'B'.repeat(22) }))
        .buddies
    ).toBe(2)
    expect(sync.leave).not.toHaveBeenCalled()
  })

  it('takes the new key of a change made here, keeping the session', async () => {
    const oldKey = random()
    const newKey = random()
    const { service, account, sync, buddies, log, stored } = setup({
      key: oldKey,
      loss,
      lastAccountId: ACCOUNT,
    })
    const tokens = { accessToken: 'at', accessExpiresAt: 1 }
    await service.adoptChangedKey(oldKey, newKey, {
      accountId: ACCOUNT,
      tokens,
    })
    expect(account.rekeyed).toHaveBeenCalledWith(oldKey, newKey, {
      accountId: ACCOUNT,
      tokens,
    })
    expect(account.changeKey).not.toHaveBeenCalled()
    expect(sync.leave).not.toHaveBeenCalled()
    expect(buddies.release).not.toHaveBeenCalled()
    expect(stored()).toBe(toB64u(newKey))
    expect(log).toEqual(['account.rekeyed', 'store.replace', 'buddies.forget'])
  })
})

describe('account key service, finding the same account', () => {
  const ACCOUNT = 'A'.repeat(22)

  it('opens a recovery key’s session only into the account this device was on', async () => {
    const newKey = random()
    const { service, account } = setup({
      key: random(),
      lastAccountId: ACCOUNT,
      sameAccountKey: toB64u(newKey),
    })
    const session = await service.sameAccountSession(newKey)
    expect(session?.accountId).toBe(ACCOUNT)
    expect(account.openDetached).toHaveBeenCalledWith(newKey, {
      accountId: ACCOUNT,
    })
  })

  it('finds none for another account’s key', async () => {
    const { service } = setup({ key: random(), lastAccountId: ACCOUNT })
    expect(await service.sameAccountSession(random())).toBeNull()
  })

  it('opens nothing on a device that was never on an account', async () => {
    const { service, account } = setup({ key: random() })
    expect(await service.sameAccountSession(random())).toBeNull()
    expect(account.openDetached).not.toHaveBeenCalled()
  })
})
