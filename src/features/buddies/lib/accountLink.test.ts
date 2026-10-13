import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/features/buddies/lib/bytes'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { RelayError } from '@/features/buddies/lib/relay'
import {
  pair,
  random,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  type CachedServerAccount,
  createServerAccount,
} from '@/lib/serverAccount/serverAccount'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

/**
 * ADR 0024: the engine links the User's inbox to their server account when it
 * registers, links inboxes registered before accounts on the next sync, and
 * stops at a suspension.
 */

type Harness = ReturnType<typeof setup>

/** A real `createServerAccount` whose server is the fake relay's accounts. */
function serverAccountOn(h: Harness, { available = true } = {}) {
  let cached: CachedServerAccount | null = null
  const register = vi.fn(async (key: { publicKey: string }) => {
    if (!available) throw new Error('offline')
    const known = [...h.fake.accounts].find(
      ([, account]) => account.accountPub === key.publicKey
    )
    const accountId = known?.[0] ?? toB64u(random(16))
    if (!known)
      h.fake.accounts.set(accountId, {
        accountPub: key.publicKey,
        status: 'active',
      })
    return { accountId, status: 'active' as const }
  })
  const account = createServerAccount({
    register,
    storage: {
      get: () => cached,
      set: (value) => {
        cached = value
      },
    },
    now: h.now,
  })
  return { account, register, forget: vi.spyOn(account, 'forget') }
}

/** Counts `inbox/register` requests from here on. */
function countRegisters(h: Harness) {
  const ops: string[] = []
  h.setAfterOp(async (op) => {
    ops.push(op)
  })
  return () => ops.filter((op) => op === 'inbox/register').length
}

const accountIdOf = (h: Harness, seed: Uint8Array) =>
  [...h.fake.accounts].find(
    ([, account]) =>
      account.accountPub === deriveAccountSigningKey(seed).publicKey
  )?.[0]

describe('linking the inbox to the server account', () => {
  it('links a new inbox when it registers', async () => {
    const h = setup()
    const { account } = serverAccountOn(h)
    const ann = h.user('Ann', undefined, random(32), { account })
    await ann.engine.sync()
    const accountId = accountIdOf(h, ann.seed)
    expect(accountId).toBeDefined()
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(accountId)
    expect(ann.store.getState().accountLinkedInboxId).toBe(ann.inboxId)
  })

  it('links an inbox registered before accounts once, on the next sync', async () => {
    const h = setup()
    const seed = random(32)
    const before = h.user('Ann', undefined, seed)
    await before.engine.sync()
    expect(h.fake.inboxAccounts.size).toBe(0)

    // The same device after an update that has accounts.
    const { account } = serverAccountOn(h)
    const ann = h.user('Ann', undefined, seed, { account })
    ann.store.setState(before.store.getState())
    const registers = countRegisters(h)
    await ann.engine.sync()
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(accountIdOf(h, seed))
    expect(ann.store.getState().accountLinkedInboxId).toBe(ann.inboxId)
    await ann.engine.sync()
    expect(registers()).toBe(1)
  })

  it('keeps working unlinked while accounts are unavailable, without extra registrations', async () => {
    const h = setup()
    const { account } = serverAccountOn(h, { available: false })
    const ann = h.user('Ann', undefined, random(32), { account })
    const registers = countRegisters(h)
    await ann.engine.sync()
    await ann.engine.sync()
    expect(registers()).toBe(1)
    expect(h.fake.inboxAccounts.size).toBe(0)
    expect(ann.store.getState().accountLinkedInboxId).toBeNull()
  })

  it('forgets an account the relay does not know, and links a fresh one', async () => {
    const h = setup()
    const { account, forget, register } = serverAccountOn(h)
    const ann = h.user('Ann', undefined, random(32), { account })
    const stale = (await account.ensure(ann.seed))!.accountId
    h.fake.accounts.clear()
    await ann.engine.sync()
    expect(forget).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledTimes(2)
    const fresh = accountIdOf(h, ann.seed)
    expect(fresh).not.toBe(stale)
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(fresh)
    expect(ann.store.getState().accountLinkedInboxId).toBe(ann.inboxId)
  })
})

describe('a suspended account', () => {
  it('stops syncing with a message, while buddies carry on', async () => {
    const h = setup()
    const { account } = serverAccountOn(h)
    const ann = h.user('Ann', undefined, random(32), { account })
    const ben = h.user('Ben', undefined, random(32), { account })
    await pair(ann, ben)

    h.fake.accounts.get(accountIdOf(h, ann.seed)!)!.status = 'suspended'
    const error = await ann.engine.sync().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RelayError)
    expect((error as RelayError).code).toBe('suspended')
    expect(buddiesErrorMessage(error)).toBe('buddies_errorSuspended')

    await expect(ben.engine.sync()).resolves.toBe('synced')
  })

  it('still lets them remove a buddy', async () => {
    const h = setup()
    const { account } = serverAccountOn(h)
    const ann = h.user('Ann', undefined, random(32), { account })
    const ben = h.user('Ben', undefined, random(32), { account })
    await pair(ann, ben)
    h.fake.accounts.get(accountIdOf(h, ann.seed)!)!.status = 'suspended'
    await ann.engine.removeBuddy(ben.inboxId)
    expect(ann.store.getState().buddies).toEqual([])
    expect(h.fake.inboxes.get(ann.inboxId)!.slots.size).toBe(0)
  })
})
