import { describe, expect, it, vi } from 'vitest'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { RelayError } from '@/features/buddies/lib/relay'
import { pair, setup } from '@/features/buddies/lib/testing/engineHarness'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

type Harness = ReturnType<typeof setup>

function countOps(h: Harness) {
  const ops: string[] = []
  h.setAfterOp(async (op) => {
    ops.push(op)
  })
  return (op: string) => ops.filter((sent) => sent === op).length
}

const accountIdOf = (h: Harness, seed: Uint8Array) =>
  [...h.fake.accounts].find(
    ([, account]) =>
      account.accountPub === deriveAccountSigningKey(seed).publicKey
  )?.[0]

describe('linking the inbox to the server account', () => {
  it("links a new inbox to its session's account when it registers", async () => {
    const h = setup()
    const ann = h.user('Ann')
    await ann.engine.sync()
    const accountId = accountIdOf(h, ann.seed)
    expect(accountId).toBeDefined()
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(accountId)
    expect(ann.store.getState().accountLinkedInboxId).toBe(ann.inboxId)
  })

  it('links an inbox from before accounts when the relay says so, then retries', async () => {
    const h = setup()
    const ann = h.user('Ann')
    await ann.engine.sync()

    h.fake.inboxAccounts.delete(ann.inboxId)
    ann.store.setState({ accountLinkedInboxId: null })

    const sent = countOps(h)
    await expect(ann.engine.sync()).resolves.toBe('synced')
    expect(sent('inbox/register')).toBe(1)

    expect(sent('inbox/sync')).toBe(2)
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(accountIdOf(h, ann.seed))
    expect(ann.store.getState().accountLinkedInboxId).toBe(ann.inboxId)

    await ann.engine.sync()
    expect(sent('inbox/register')).toBe(1)
  })

  it('links before any owner op, not only reads', async () => {
    const h = setup()
    const ann = h.user('Ann')
    await ann.engine.sync()
    h.fake.inboxAccounts.delete(ann.inboxId)
    await ann.engine.createInvite()
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(accountIdOf(h, ann.seed))
    expect(h.fake.invites.size).toBe(1)
  })

  it("opens a new session when the relay doesn't know its account", async () => {
    const h = setup()
    const ann = h.user('Ann')
    const { accountId: stale } = await ann.sessions.ensure()

    h.fake.accounts.clear()
    await ann.engine.sync()
    const fresh = accountIdOf(h, ann.seed)
    expect(fresh).toBeDefined()
    expect(fresh).not.toBe(stale)
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(fresh)
    expect(ann.store.getState().accountLinkedInboxId).toBe(ann.inboxId)
  })
})

describe('a session for every request', () => {
  it('sends nothing to the relay from a device that can’t be verified', async () => {
    const h = setup()
    const ann = h.user('Ann')
    ann.setAttestation('device')
    const error = await ann.engine.sync().catch((e: unknown) => e)
    expect(error).toEqual(
      new RelayError('unverified', 0, 30 * 60 * 1000, 'device')
    )
    expect(buddiesErrorMessage(error)).toBe('buddies_errorUnverified')
    await expect(ann.engine.createInvite()).rejects.toMatchObject({
      code: 'unverified',
    })
    expect(h.fake.requests).toEqual([])
    expect(ann.store.getState().registeredInboxId).toBeNull()
  })

  it('backs off automatic syncs while verifying waits, and starts once verified', async () => {
    const h = setup()
    const ann = h.user('Ann')
    ann.setAttestation('temporary')
    const error = await ann.engine.sync().catch((e: unknown) => e)
    expect(buddiesErrorMessage(error)).toBe('buddies_errorVerifyLater')
    expect(ann.engine.coolingDown()).toBe(true)
    await expect(ann.engine.sync({ automatic: true })).resolves.toBe('skipped')

    ann.setAttestation(null)
    h.advance(60 * 1000)
    await expect(ann.engine.sync({ automatic: true })).resolves.toBe('synced')
    expect(h.fake.inboxAccounts.get(ann.inboxId)).toBe(accountIdOf(h, ann.seed))
  })

  it('refreshes an expired access token once and sends again', async () => {
    const h = setup()
    const ann = h.user('Ann')
    await ann.engine.sync()
    h.fake.expireAccessTokens()
    const sent = countOps(h)
    await expect(ann.engine.sync()).resolves.toBe('synced')

    expect(sent('inbox/sync')).toBe(2)
    expect(h.fake.sessions.size).toBe(1)
  })
})

describe('a suspended account', () => {
  it('stops syncing with a message, while buddies carry on', async () => {
    const h = setup()
    const ann = h.user('Ann')
    const ben = h.user('Ben')
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
    const ann = h.user('Ann')
    const ben = h.user('Ben')
    await pair(ann, ben)
    h.fake.accounts.get(accountIdOf(h, ann.seed)!)!.status = 'suspended'
    await ann.engine.removeBuddy(ben.inboxId)
    expect(ann.store.getState().buddies).toEqual([])
    expect(h.fake.inboxes.get(ann.inboxId)!.slots.size).toBe(0)
  })
})
